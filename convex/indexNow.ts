import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { env, internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { creatorRestricted } from "./authz";
import { INDEXNOW_BATCH_SIZE, indexNowChanges, indexNowConfig, indexNowPaths, indexNowUrls, submitIndexNow, type IndexNowState } from "./indexNowModel";

/** Gathers changes from a burst of publishes (a course publishes its lessons too) into one submission. */
const FLUSH_DELAY_MS = 60_000;
/** A queue entry this old means its scheduled flush was lost, so the next change schedules another. */
const STALE_MS = 15 * 60_000;

export type IndexNowTable = "forms" | "lessons" | "learnCollections";
export const indexNowAssetTables: readonly string[] = ["forms", "lessons", "learnCollections"];

export const indexNowEnabled = () => indexNowConfig(env) !== null;

/**
 * What crawlers see at an asset's public URL, or null when that page is not indexable. Mirrors the
 * pages' robots rules: lessons need an explicit "index" opt-in, forms need the creator's indexing
 * opt-in on a live public form, courses need a public, unarchived published snapshot.
 */
export async function indexNowState(ctx: MutationCtx, table: IndexNowTable, id: string): Promise<IndexNowState> {
  switch (table) {
    case "lessons": {
      const row = await ctx.db.get("lessons", id as Id<"lessons">);
      if (!row || row.status !== "active" || row.visibility !== "public" || row.communityState !== "ok" || !row.publishedVersionId) return null;
      const version = await ctx.db.get("lessonVersions", row.publishedVersionId);
      if (!version || version.lessonId !== row._id || (version.visibility !== undefined && version.visibility !== "public") || version.metadata.indexing !== "index") return null;
      if (await creatorRestricted(ctx, row.ownerId)) return null;
      return { path: indexNowPaths.lesson(row._id), fingerprint: JSON.stringify([version.metadata, version.document]) };
    }
    case "learnCollections": {
      const row = await ctx.db.get("learnCollections", id as Id<"learnCollections">);
      if (!row || row.archived || row.visibility !== "public" || row.communityState !== "ok" || !row.publishedVersionId) return null;
      const version = await ctx.db.get("collectionVersions", row.publishedVersionId);
      if (!version || version.collectionId !== row._id || version.metadata.indexing === "noindex") return null;
      if (await creatorRestricted(ctx, row.ownerId)) return null;
      return { path: indexNowPaths.course(row._id), fingerprint: JSON.stringify([version.metadata, version.items]) };
    }
    case "forms": {
      const row: Doc<"forms"> | null = await ctx.db.get("forms", id as Id<"forms">);
      if (!row || row.status !== "live" || row.isBanned || row.settings.access !== "public" || !row.settings.allowIndexing || row.publishedVersion === undefined) return null;
      const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", q => q.eq("formId", row._id).eq("version", row.publishedVersion!)).unique();
      if (!version || await creatorRestricted(ctx, row.ownerId)) return null;
      return { path: indexNowPaths.form(row.shareId), fingerprint: JSON.stringify(version.definition) };
    }
  }
}

/** Runs a write and queues the asset's public URL when its indexable page changed. */
export async function withIndexNow<T>(ctx: MutationCtx, table: IndexNowTable, id: string | null, write: () => Promise<T>, idOf: (result: T) => string = () => id!): Promise<T> {
  if (!indexNowEnabled()) return write();
  const before = id ? await indexNowState(ctx, table, id) : null;
  const result = await write();
  const after = await indexNowState(ctx, table, idOf(result));
  await queueIndexNow(ctx, indexNowChanges(before, after));
  return result;
}

/**
 * Queues public paths for the next batched submission. A no-op when IndexNow is not configured.
 * Paths are validated and deduplicated here and again before sending.
 */
export async function queueIndexNow(ctx: MutationCtx, paths: string[]): Promise<void> {
  const config = indexNowConfig(env);
  if (!config || !paths.length) return;
  const urls = indexNowUrls(config.origin, paths);
  if (!urls.length) return;
  const oldest = await ctx.db.query("indexNowQueue").withIndex("by_queuedAt").first();
  const now = Date.now();
  for (const url of urls) {
    const queued = await ctx.db.query("indexNowQueue").withIndex("by_url", q => q.eq("url", url)).unique();
    if (!queued) await ctx.db.insert("indexNowQueue", { url, queuedAt: now });
  }
  // A non-empty queue always has a flush pending, so only an empty or stuck queue schedules one.
  if (!oldest || now - oldest.queuedAt > STALE_MS) await ctx.scheduler.runAfter(FLUSH_DELAY_MS, internal.indexNow.flush, {});
}

/** Removes and returns the oldest batch; schedules the next flush when more remain. */
export const takeBatch = internalMutation({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const rows = await ctx.db.query("indexNowQueue").withIndex("by_queuedAt").take(INDEXNOW_BATCH_SIZE + 1);
    const batch = rows.slice(0, INDEXNOW_BATCH_SIZE);
    for (const row of batch) await ctx.db.delete("indexNowQueue", row._id);
    if (rows.length > INDEXNOW_BATCH_SIZE) await ctx.scheduler.runAfter(0, internal.indexNow.flush, {});
    return batch.map(row => row.url);
  },
});

/** Sends one batch. Failures are logged and dropped; the sitemap remains the fallback. */
export const flush = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const urls = await ctx.runMutation(internal.indexNow.takeBatch, {});
    const config = indexNowConfig(env);
    if (config && urls.length) await submitIndexNow(config, urls);
    return null;
  },
});
