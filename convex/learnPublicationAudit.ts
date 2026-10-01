import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireActiveUser, requireAdmin } from "./authz";
import schema from "./schema";
import { auditedAsset } from "./learnPublicationAuditModel";

/** Written in the same transaction as the state change. No lesson/source bytes. */
export async function recordPublicationAction(ctx: MutationCtx, entry: Omit<Doc<"learnPublicationAudit">, "_id" | "_creationTime" | "createdAt">) {
  return ctx.db.insert("learnPublicationAudit", { ...entry, createdAt: Date.now() });
}
export async function recordAssetPublicationAction(ctx: MutationCtx, entry: Omit<Doc<"learnAssetPublicationAudit">, "_id" | "_creationTime" | "createdAt">) {
  return ctx.db.insert("learnAssetPublicationAudit", { ...entry, createdAt: Date.now() });
}

export const listAsset = query({
  args: { asset: auditedAsset, paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("learnAssetPublicationAudit")),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const asset = args.asset.kind === "collection" ? await ctx.db.get("learnCollections", args.asset.id) : await ctx.db.get("flashcardSets", args.asset.id);
    if (!asset) throw new Error("Asset not found or unauthorized");
    if (asset.ownerId !== identity.subject) await requireAdmin(ctx);
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) throw new Error("Page size must be 1–50");
    return ctx.db.query("learnAssetPublicationAudit").withIndex("by_asset", q => q.eq("asset", args.asset)).order("desc").paginate(args.paginationOpts);
  },
});

export const list = query({
  args: { lessonId: v.id("lessons"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("learnPublicationAudit")),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const lesson = await ctx.db.get("lessons", args.lessonId);
    if (!lesson) throw new Error("Lesson not found or unauthorized");
    if (lesson.ownerId !== identity.subject) await requireAdmin(ctx);
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) throw new Error("Page size must be 1–50");
    return ctx.db.query("learnPublicationAudit").withIndex("by_lessonId", q => q.eq("lessonId", args.lessonId)).order("desc").paginate(args.paginationOpts);
  },
});
