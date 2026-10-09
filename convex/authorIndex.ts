import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { indexNowAssetTables, withIndexNow, type IndexNowTable } from "./indexNow";

export const authorTables = ["forms", "lessons", "learnCollections"] as const;
export type AuthorTable = typeof authorTables[number];

/** The published snapshot decides discovery. Draft edits never expose private work. */
async function eligibility(ctx: MutationCtx, table: AuthorTable, id: string) {
  switch (table) {
    case "forms": {
      const row = await ctx.db.get("forms", id as Id<"forms">);
      if (!row) return null;
      const eligible = row.status === "live" && !row.isBanned && row.settings.access === "public" && row.settings.allowIndexing && row.publishedVersion !== undefined;
      const version = eligible ? await ctx.db.query("formVersions").withIndex("by_formId_and_version", q => q.eq("formId", row._id).eq("version", row.publishedVersion!)).unique() : null;
      return { ownerId: row.ownerId, eligible: !!version };
    }
    case "lessons": {
      const row = await ctx.db.get("lessons", id as Id<"lessons">);
      if (!row) return null;
      const eligible = row.status === "active" && row.visibility === "public" && row.communityState === "ok" && row.publishedVersionId;
      const version = eligible ? await ctx.db.get("lessonVersions", row.publishedVersionId!) : null;
      return { ownerId: row.ownerId, eligible: !!version && version.lessonId === row._id && version.visibility !== "private" && version.visibility !== "restricted" && version.metadata.indexing !== "noindex" };
    }
    case "learnCollections": {
      const row = await ctx.db.get("learnCollections", id as Id<"learnCollections">);
      if (!row) return null;
      const eligible = !row.archived && row.visibility === "public" && row.communityState === "ok" && row.publishedVersionId;
      const version = eligible ? await ctx.db.get("collectionVersions", row.publishedVersionId!) : null;
      return { ownerId: row.ownerId, eligible: !!version && version.collectionId === row._id && version.metadata.indexing !== "noindex" };
    }
  }
}

export async function changeCount(ctx: MutationCtx, ownerId: string, delta: number) {
  const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", ownerId)).unique();
  if (user) await ctx.db.patch("users", user._id, { publicAuthorAssets: Math.max(0, (user.publicAuthorAssets ?? 0) + delta) });
}

/** Idempotent and transactional: publication and directory membership change together. */
export async function syncAuthorAsset(ctx: MutationCtx, table: AuthorTable, assetId: string, removed = false) {
  const before = await ctx.db.query("publicAuthorAssets").withIndex("by_assetId", q => q.eq("assetId", assetId)).unique();
  const after = removed ? null : await eligibility(ctx, table, assetId);
  const owner = after?.eligible ? await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", after.ownerId)).unique() : null;
  const nextOwner = owner ? after!.ownerId : null;
  if (before?.ownerId === nextOwner || (!before && !nextOwner)) return;
  if (before) {
    await ctx.db.delete("publicAuthorAssets", before._id);
    await changeCount(ctx, before.ownerId, -1);
  }
  if (nextOwner) {
    await ctx.db.insert("publicAuthorAssets", { assetId, table, ownerId: nextOwner });
    await changeCount(ctx, nextOwner, 1);
  }
}

const discoveryFields = new Set(["status", "settings", "publishedVersion", "publishedVersionId", "isPublished", "publishedSnapshot", "isBanned", "visibility", "communityState", "archived", "ownerId", "creatorId"]);

/** Preserve the generated writer signatures while observing only publication-related writes.
 * Call sites retain Convex's table/id/value checking; the internal bridge forwards the same arguments.
 */
export function authorDb(ctx: MutationCtx): Pick<MutationCtx["db"], "insert" | "patch" | "replace" | "delete"> {
  const observe = (method: "insert" | "patch" | "replace" | "delete") => async (...args: unknown[]) => {
    const table = args[0] as AuthorTable;
    if (method === "patch" && !Object.keys(args[2] as object).some(key => discoveryFields.has(key))) return Reflect.apply(ctx.db[method], ctx.db, args);
    const write = async () => {
      const result: unknown = await Reflect.apply(ctx.db[method], ctx.db, args);
      await syncAuthorAsset(ctx, table, (method === "insert" ? result : args[1]) as string, method === "delete");
      return result;
    };
    // Public pages whose indexable state changes are queued for IndexNow (convex/indexNow.ts).
    if (!indexNowAssetTables.includes(table)) return write();
    return withIndexNow(ctx, table as IndexNowTable, method === "insert" ? null : args[1] as string, write, result => (method === "insert" ? result : args[1]) as string);
  };
  return {
    insert: observe("insert") as MutationCtx["db"]["insert"],
    patch: observe("patch") as MutationCtx["db"]["patch"],
    replace: observe("replace") as MutationCtx["db"]["replace"],
    delete: observe("delete") as MutationCtx["db"]["delete"],
  };
}
