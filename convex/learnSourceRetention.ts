import { changeSourceStorage } from "./sourceStorage";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { creatorRestricted, requireActiveUser } from "./authz";

export const SOURCE_RETENTION_LIMITS = { graceMs: 30 * 86400_000, orphanGraceMs: 86400_000, jobsPerBatch: 1, versionsPerStep: 5 } as const;

/** Bound historical verification reads independently of an individual version's size. */
export function sourceVersionPage(cursor: string | null) {
  return { numItems: SOURCE_RETENTION_LIMITS.versionsPerStep, cursor, maximumRowsRead: SOURCE_RETENTION_LIMITS.versionsPerStep, maximumBytesRead: 1_800_000 };
}
const worker = makeFunctionReference<"mutation", { cursor?: string | null }, unknown>("learnSourceRetention:cleanup");

/** Only the authenticated upload action calls this with the blob it just stored.
 * There is deliberately no public storage-ID registration or global storage sweep. */
export const trackUpload = internalMutation({
  args: { storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    return trackSourceUploadForActor(ctx,identity.subject,args.storageId);
  },
});

/** Shared orphan tracking for the native and actor-verified MCP upload actions. */
export async function trackSourceUploadForActor(ctx: MutationCtx, actor: string, storageId: Id<"_storage">) {
    if (!(await ctx.db.system.get("_storage", storageId))) throw new Error("Upload missing");
    const prior = await ctx.db.query("learnSourceCleanup").withIndex("by_storageId", q => q.eq("storageId", storageId)).first();
    if (!prior) await ctx.db.insert("learnSourceCleanup", { storageId: storageId, ownerId: actor, dueAt: Date.now() + SOURCE_RETENTION_LIMITS.orphanGraceMs, cursor: null });
    return null;
}

/** Explicit owner consent deletes bytes only; the citation/provenance row survives.
 * Removed sources cannot be republished, so history cannot gain new references
 * while this bounded verification walks immutable versions. */
export const requestPurge = mutation({
  args: { sourceId: v.id("learnSources") }, returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const source = await ctx.db.get("learnSources", args.sourceId);
    if (!source || source.ownerId !== identity.subject) throw new Error("Source not found or unauthorized");
    if (source.status !== "removed") throw new Error("Remove the source before requesting file purge");
    if (!source.storageId) return null;
    // Any moderation history is a preservation hold, including restored/appealed cases.
    if (await ctx.db.query("learnSourceAudit").withIndex("by_sourceId", q => q.eq("sourceId", source._id)).first()) throw new Error("Moderation evidence is retained");
    const prior = await ctx.db.query("learnSourceCleanup").withIndex("by_storageId", q => q.eq("storageId", source.storageId!)).first();
    if (prior?.sourceId === source._id) return null;
    if (prior) await ctx.db.delete("learnSourceCleanup", prior._id);
    await ctx.db.insert("learnSourceCleanup", { sourceId: source._id, storageId: source.storageId, ownerId: source.ownerId, dueAt: Date.now() + SOURCE_RETENTION_LIMITS.graceMs, cursor: null });
    return null;
  },
});

/** Cron entry point. Each transaction processes <=1 job and <=5 versions.
 * Continuations revisit the bounded due index, never an unbounded scan. */
export const cleanup = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ processed: v.number(), deleted: v.number(), held: v.number() }),
  handler: async (ctx, args) => {
    void args;
    const jobs = await ctx.db.query("learnSourceCleanup").withIndex("by_dueAt", q => q.lte("dueAt", Date.now())).take(SOURCE_RETENTION_LIMITS.jobsPerBatch);
    let deleted = 0, held = 0;
    for (const job of jobs) {
      if (await creatorRestricted(ctx, job.ownerId)) { held++; await ctx.db.patch("learnSourceCleanup", job._id, { dueAt: Date.now() + SOURCE_RETENTION_LIMITS.orphanGraceMs }); continue; }
      const linked = await ctx.db.query("learnSources").withIndex("by_storageId", q => q.eq("storageId", job.storageId)).take(2);
      if (!job.sourceId) {
        if (!linked.length && await ctx.db.system.get("_storage", job.storageId)) { await ctx.storage.delete(job.storageId); deleted++; }
        await ctx.db.delete("learnSourceCleanup", job._id);
        continue;
      }
      const source = await ctx.db.get("learnSources", job.sourceId);
      if (!source || source.ownerId !== job.ownerId || source.storageId !== job.storageId || source.status !== "removed" || linked.length !== 1 || await ctx.db.query("learnSourceAudit").withIndex("by_sourceId", q => q.eq("sourceId", job.sourceId!)).first()) {
        held++; await ctx.db.delete("learnSourceCleanup", job._id); continue;
      }
      const options = sourceVersionPage(job.cursor);
      // Older jobs have lesson cursors and no phase. Never reuse one table's
      // cursor for another table; phase transitions commit a fresh null cursor.
      if ((job.phase ?? "lessons") === "lessons") {
        const versions = await ctx.db.query("lessonVersions").paginate(options);
        const referenced = versions.page.some(version => version.document.blocks.some(block => ("sourceId" in block && block.sourceId === job.sourceId) || block.citations.some(citation => citation.sourceId === job.sourceId)));
        if (referenced) { held++; await ctx.db.delete("learnSourceCleanup", job._id); continue; }
        await ctx.db.patch("learnSourceCleanup", job._id, versions.isDone ? { phase: "collections", cursor: null } : { cursor: versions.continueCursor });
        continue;
      }
      const versions = await ctx.db.query("collectionVersions").paginate(options);
      if (versions.page.some(version => version.items.some(item => item.kind === "source" && item.id === job.sourceId))) { held++; await ctx.db.delete("learnSourceCleanup", job._id); continue; }
      if (!versions.isDone) { await ctx.db.patch("learnSourceCleanup", job._id, { cursor: versions.continueCursor }); continue; }
      // Flashcard versions currently contain only text and concept IDs (cards
      // validator in learnAssetModel), with no source IDs or file references.
      if (await ctx.db.system.get("_storage", job.storageId)) { await ctx.storage.delete(job.storageId); deleted++; }
      await ctx.db.patch("learnSources", source._id, { storageId: undefined, storageCounted: false });
      // Only bytes that were counted are uncounted, so a file the backfill has not reached never goes negative.
      if (source.storageCounted) await changeSourceStorage(ctx, source.ownerId, -(source.size ?? 0));
      await ctx.db.delete("learnSourceCleanup", job._id);
    }
    if (jobs.length) await ctx.scheduler.runAfter(0, worker, {});
    return { processed: jobs.length, deleted, held };
  },
});
