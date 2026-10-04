import { getAuthIdentity } from "./authIdentity";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireIdentity, requireActiveUser, creatorRestricted } from "./authz";
import schema from "./schema";

function pageSize(numItems: number) {
  if (!Number.isSafeInteger(numItems) || numItems < 1 || numItems > 100) throw new Error("Page size must be 1..100");
}

// Read adapters only: mutations and their revision checks remain in the owning services.
export const annotations = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("learnPersonal")),
  handler: async (ctx, args) => {
    pageSize(args.paginationOpts.numItems);
    const identity = await requireIdentity(ctx);
    return ctx.db.query("learnPersonal").withIndex("by_owner_and_key", q => q.eq("owner", identity.tokenIdentifier)).paginate(args.paginationOpts);
  },
});
export const folders = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("folders")),
  handler: async (ctx, args) => {
    pageSize(args.paginationOpts.numItems);
    const { identity } = await requireActiveUser(ctx);
    return ctx.db.query("folders").withIndex("by_ownerId_and_parentId", q => q.eq("ownerId", identity.subject)).paginate(args.paginationOpts);
  },
});
export const members = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("folderMembers")),
  handler: async (ctx, args) => {
    pageSize(args.paginationOpts.numItems);
    const { identity } = await requireActiveUser(ctx);
    return ctx.db.query("folderMembers").withIndex("by_ownerId_and_folderId_and_asset", q => q.eq("ownerId", identity.subject)).paginate(args.paginationOpts);
  },
});
export const flashcards = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("flashcardSets")),
  handler: async (ctx, args) => {
    pageSize(args.paginationOpts.numItems);
    const { identity } = await requireActiveUser(ctx);
    return ctx.db.query("flashcardSets").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", identity.subject)).order("desc").paginate(args.paginationOpts);
  },
});
export const flashcard = query({
  args: { id: v.string() }, returns: v.union(schema.doc("flashcardSets"), v.null()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("flashcardSets", args.id);
    if (!id) return null;
    const row = await ctx.db.get("flashcardSets", id), identity = await getAuthIdentity(ctx);
    if (!row || row.archived || (row.ownerId !== identity?.subject && (row.visibility !== "public" || !row.publishedVersionId || await creatorRestricted(ctx, row.ownerId)))) return null;
    if (row.ownerId === identity?.subject) return row;
    const version = await ctx.db.get("flashcardVersions", row.publishedVersionId!);
    return version ? { ...row, title: version.title, cards: version.cards } : null;
  },
});
export const collections = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("learnCollections")),
  handler: async (ctx, args) => {
    pageSize(args.paginationOpts.numItems);
    const { identity } = await requireActiveUser(ctx);
    return ctx.db.query("learnCollections").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", identity.subject)).order("desc").paginate(args.paginationOpts);
  },
});
export const collection = query({
  args: { id: v.string() }, returns: v.union(schema.doc("collectionVersions"), v.null()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("learnCollections", args.id);
    const row = id && await ctx.db.get("learnCollections", id), identity = await getAuthIdentity(ctx);
    if (!row || !row.publishedVersionId || (row.ownerId !== identity?.subject && (row.visibility !== "public" || row.communityState !== "ok" || await creatorRestricted(ctx, row.ownerId)))) return null;
    return ctx.db.get("collectionVersions", row.publishedVersionId);
  },
});

/** Lightweight owner picker; pagination never loads assessment questions or responses. */
export const quizChoices = query({
  args: { kind: v.union(v.literal("form"), v.literal("quiz")), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ id: v.string(), title: v.string(), published: v.boolean() })),
  handler: async (ctx, args) => {
    pageSize(args.paginationOpts.numItems);
    const { identity } = await requireActiveUser(ctx);
    if (args.kind === "form") {
      const result = await ctx.db.query("forms").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", identity.subject)).order("desc").paginate(args.paginationOpts);
      return { ...result, page: result.page.filter(f => f.status !== "archived" && !f.isBanned && f.draft.quiz?.enabled).map(f => ({ id: f._id, title: f.title, published: f.status === "live" && f.publishedVersion !== undefined })) };
    }
    const result = await ctx.db.query("quizzes").withIndex("by_creator_createdAt", q => q.eq("creatorId", identity.subject)).order("desc").paginate(args.paginationOpts);
    return { ...result, page: result.page.filter(q => !q.isBanned).map(q => ({ id: q._id, title: q.title, published: q.isPublished && !!q.publishedSnapshot })) };
  },
});
