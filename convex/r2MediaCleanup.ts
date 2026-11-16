import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { env, internalAction, internalMutation } from "./_generated/server";
import { r2Config, signR2Request } from "../lib/r2/privateR2";
import { changeSourceStorage } from "./sourceStorage";

const kind = v.union(v.literal("course"), v.literal("form"), v.literal("question"));
type Kind = "course" | "form" | "question";
const args = { kind, id: v.string() };

/** Retire expired reservations transactionally before deleting their bytes. */
export const claim = internalMutation({
  args, returns: v.union(v.null(), v.string()),
  handler: async (ctx, { kind, id }) => {
    if (kind === "course") {
      const key = ctx.db.normalizeId("courseMediaObjects", id);
      const row = key ? await ctx.db.get("courseMediaObjects", key) : null;
      if (!row || (row.status !== "removed" && !(row.status === "pending" && row.expiresAt <= Date.now()))) return null;
      if (row.status === "pending") await ctx.db.patch("courseMediaObjects", row._id, { status: "removed" });
      return "course-media/" + row._id;
    }
    if (kind === "form") {
      const key = ctx.db.normalizeId("formImageMedia", id);
      const row = key ? await ctx.db.get("formImageMedia", key) : null;
      if (!row || (row.status !== "removed" && !(row.status === "pending" && row.expiresAt <= Date.now()))) return null;
      if (row.status === "pending") await ctx.db.patch("formImageMedia", row._id, { status: "removed" });
      return "form-images/" + row._id;
    }
    const key = ctx.db.normalizeId("questionBankMedia", id);
    const row = key ? await ctx.db.get("questionBankMedia", key) : null;
    if (!row || (row.status !== "removed" && !(row.status === "pending" && row.expiresAt <= Date.now()))) return null;
    if (row.status === "pending") await ctx.db.patch("questionBankMedia", row._id, { status: "removed" });
    return "question-images/" + row._id;
  },
});
const claimRef = makeFunctionReference<"mutation", { kind: Kind; id: string }, string | null>("r2MediaCleanup:claim");
const cleanupRef = makeFunctionReference<"action", { kind: Kind; id: string }, null>("r2MediaCleanup:cleanup");
export const releaseStorage = internalMutation({
  args, returns: v.null(),
  handler: async (ctx, { kind, id }) => {
    const table = kind === "course" ? "courseMediaObjects" : kind === "form" ? "formImageMedia" : "questionBankMedia";
    const key = ctx.db.normalizeId(table, id);
    const row = key ? await ctx.db.get(table, key) : null;
    if (!row || row.status !== "removed" || !row.storageCounted) return null;
    await changeSourceStorage(ctx, row.ownerId, -row.bytes);
    await ctx.db.patch(table, row._id, { storageCounted: false });
    return null;
  },
});
const releaseRef = makeFunctionReference<"mutation", { kind: Kind; id: string }, null>("r2MediaCleanup:releaseStorage");

/** A failed storage request retries; create-only PUT URLs have expired before cleanup. */
export const cleanup = internalAction({
  args, returns: v.null(),
  handler: async (ctx, input) => {
    const key = await ctx.runMutation(claimRef, input);
    if (!key) return null;
    try {
      const signed = await signR2Request(r2Config(env), "DELETE", key, { expiresSeconds: 30 });
      const response = await fetch(signed.url, { method: "DELETE", redirect: "error", cache: "no-store" });
      if (!response.ok && response.status !== 404) throw new Error("R2 cleanup failed");
      await ctx.runMutation(releaseRef, input);
    } catch {
      await ctx.scheduler.runAfter(5 * 60_000, cleanupRef, input);
    }
    return null;
  },
});

const accountingPage = makeFunctionReference<"mutation", { kind?: Kind; cursor?: string | null }, null>("r2MediaCleanup:backfillStorage");
/** Restartable legacy accounting; new reservations and successful deletions already update the same counter. */
export const backfillStorage = internalMutation({
  args: { kind: v.optional(kind), cursor: v.optional(v.union(v.string(), v.null())) }, returns: v.null(),
  handler: async (ctx, { kind = "course", cursor = null }): Promise<null> => {
    const table = kind === "course" ? "courseMediaObjects" : kind === "form" ? "formImageMedia" : "questionBankMedia";
    const page = await ctx.db.query(table).paginate({ numItems: 25, cursor, maximumRowsRead: 25, maximumBytesRead: 500_000 });
    for (const row of page.page) {
      if (row.storageCounted !== undefined) continue;
      if (!Number.isSafeInteger(row.bytes) || row.bytes < 1) throw new Error("INTEGRITY_ERROR: Invalid legacy media size.");
      await changeSourceStorage(ctx, row.ownerId, row.bytes);
      await ctx.db.patch(table, row._id, { storageCounted: true });
      if (row.status === "removed" || (row.status === "pending" && row.expiresAt <= Date.now()))
        await ctx.scheduler.runAfter(65_000, cleanupRef, { kind, id: row._id });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, accountingPage, { kind, cursor: page.continueCursor });
    else if (kind !== "question") await ctx.scheduler.runAfter(0, accountingPage,
      { kind: kind === "course" ? "form" : "question", cursor: null });
    return null;
  },
});
