import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthIdentity } from "./authIdentity";
import { planCatalog } from "../lib/planCatalog";

/**
 * Teaching source files an account may keep in storage at once, on every plan. Files count from the
 * moment they are registered until source retention deletes their blob, so removing a source frees
 * its space once cleanup runs. Duplicates of a file the account already keeps never count twice.
 */
export const SOURCE_STORAGE_QUOTA = planCatalog.uploads.teachingStorageBytes;
/** Uploads per account per hour; checked before a body is read and spent when a file is registered. */
export const SOURCE_UPLOADS_PER_HOUR = 40;
export const SOURCE_UPLOAD_WINDOW_MS = 60 * 60 * 1000;
export const sourceUploadRateKey = (ownerId: string) => `learn:source-upload:${ownerId}`;

async function usageRow(ctx: QueryCtx | MutationCtx, ownerId: string) {
  return await ctx.db.query("sourceStorageUsage").withIndex("by_ownerId", q => q.eq("ownerId", ownerId)).unique();
}

export async function sourceStorageUsed(ctx: QueryCtx | MutationCtx, ownerId: string) {
  return (await usageRow(ctx, ownerId))?.bytes ?? 0;
}

export async function changeSourceStorage(ctx: MutationCtx, ownerId: string, delta: number) {
  const row = await usageRow(ctx, ownerId);
  if (row) await ctx.db.patch("sourceStorageUsage", row._id, { bytes: Math.max(0, row.bytes + delta) });
  else if (delta > 0) await ctx.db.insert("sourceStorageUsage", { ownerId, bytes: delta });
}

const quotaMessage = () => `STORAGE_QUOTA: Your teaching files use the ${SOURCE_STORAGE_QUOTA / 1024 ** 3} GiB allowance. Remove sources you no longer need and try again.`;

export async function assertSourceStorageAvailable(ctx: QueryCtx | MutationCtx, ownerId: string, incoming: number) {
  if ((await sourceStorageUsed(ctx, ownerId)) + incoming > SOURCE_STORAGE_QUOTA) throw new Error(quotaMessage());
}

/**
 * Admission before an upload's body is read: refuses an account that has spent its hourly uploads or
 * whose storage cannot take the declared size, so a refused file is never received or stored.
 * Registration repeats both checks with the real size.
 */
export const admitUpload = internalQuery({
  args: { bytes: v.number() },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), status: v.number(), message: v.string() })),
  handler: async (ctx, args) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return { ok: false as const, status: 401, message: "Not authenticated" };
    const now = Date.now(), windowStart = now - (now % SOURCE_UPLOAD_WINDOW_MS);
    const window = await ctx.db.query("rateWindows").withIndex("by_key_and_windowStart", q => q.eq("key", sourceUploadRateKey(identity.subject)).eq("windowStart", windowStart)).unique();
    if (window && window.count >= SOURCE_UPLOADS_PER_HOUR) return { ok: false as const, status: 429, message: "Too many uploads. Try again later." };
    if ((await sourceStorageUsed(ctx, identity.subject)) + args.bytes > SOURCE_STORAGE_QUOTA) return { ok: false as const, status: 413, message: quotaMessage() };
    return { ok: true as const };
  },
});

/**
 * One-time backfill for accounts that kept files before usage was counted. Walks learnSources by
 * owner, a page per transaction, and writes each owner's total once all their rows are read.
 * Start with `npx convex run sourceStorage:backfill '{"restart": true}'`; it schedules itself.
 */
export const backfill = internalMutation({
  args: { restart: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    let state = await ctx.db.query("sourceStorageBackfill").first();
    if (state && args.restart) { await ctx.db.delete("sourceStorageBackfill", state._id); state = null; }
    if (!state) state = (await ctx.db.get("sourceStorageBackfill", await ctx.db.insert("sourceStorageBackfill", { cursor: null, ownerId: null, bytes: 0, done: false })))!;
    if (state.done) return null;
    const page = await ctx.db.query("learnSources").withIndex("by_ownerId_and_sha256_and_status").paginate({ cursor: state.cursor, numItems: 100, maximumBytesRead: 4_000_000 });
    let { ownerId, bytes } = state;
    const settle = async () => { if (ownerId !== null) await setUsage(ctx, ownerId, bytes); };
    for (const source of page.page) {
      if (source.ownerId !== ownerId) { await settle(); ownerId = source.ownerId; bytes = 0; }
      if (source.storageId) bytes += source.size ?? 0;
    }
    if (page.isDone) await settle();
    await ctx.db.patch("sourceStorageBackfill", state._id, { cursor: page.continueCursor, ownerId, bytes, done: page.isDone });
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.sourceStorage.backfill, {});
    return null;
  },
});

async function setUsage(ctx: MutationCtx, ownerId: string, bytes: number) {
  const row = await usageRow(ctx, ownerId);
  if (row) await ctx.db.patch("sourceStorageUsage", row._id, { bytes });
  else if (bytes > 0) await ctx.db.insert("sourceStorageUsage", { ownerId, bytes });
}
