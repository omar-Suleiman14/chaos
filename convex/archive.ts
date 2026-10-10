import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireIdentity } from "./authz";

const kind = v.union(v.literal("forms"), v.literal("quizzes"), v.literal("courses"), v.literal("lessons"), v.literal("flashcards"));
const row = v.object({ id: v.string(), title: v.string(), updatedAt: v.number(), count: v.number(), published: v.boolean(), revision: v.optional(v.number()), accent: v.optional(v.string()) });

/** Owner-only, bounded recovery inventory. No drafts, questions, cards, answers or invite data leave this query. */
export const list = query({ args: { kind, paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(row), handler: async (ctx, args) => {
  const identity = await requireIdentity(ctx);
  if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) throw new Error("Page size must be 1..50");
  const page = { ...args.paginationOpts, maximumBytesRead: 2_000_000, maximumRowsRead: 100 };
  if (args.kind === "forms" || args.kind === "quizzes") {
    const result = await ctx.db.query("forms").withIndex("by_ownerId_and_status_and_updatedAt", q => q.eq("ownerId", identity.subject).eq("status", "archived")).order("desc").paginate(page);
    return { ...result, page: result.page.filter(form => form.pendingDeleteAt === undefined && !!form.draft.quiz?.enabled === (args.kind === "quizzes")).map(form => ({ id: String(form._id), title: form.title, updatedAt: form.updatedAt, count: form.responseCount, published: form.publishedVersion !== undefined, accent: form.draft.theme.accent, revision: undefined })) };
  }
  if (args.kind === "courses") {
    const result = await ctx.db.query("learnCollections").withIndex("by_ownerId_and_archived_and_updatedAt", q => q.eq("ownerId", identity.subject).eq("archived", true)).order("desc").paginate(page);
    return { ...result, page: result.page.map(course => ({ id: String(course._id), title: course.metadata.title, updatedAt: course.updatedAt, count: course.lessonIds?.length ?? course.items.filter(item => item.kind === "lesson").length, published: !!course.publishedVersionId , revision: undefined, accent: undefined })) };
  }
  if (args.kind === "lessons") {
    const result = await ctx.db.query("lessons").withIndex("by_ownerId_and_status_and_updatedAt", q => q.eq("ownerId", identity.subject).eq("status", "archived")).order("desc").paginate(page);
    return { ...result, page: result.page.map(lesson => ({ id: String(lesson._id), title: lesson.metadata.title, updatedAt: lesson.updatedAt, count: lesson.draft.blocks.length, published: !!lesson.publishedVersionId, revision: lesson.revision, accent: undefined })) };
  }
  const result = await ctx.db.query("flashcardSets").withIndex("by_ownerId_and_archived_and_updatedAt", q => q.eq("ownerId", identity.subject).eq("archived", true)).order("desc").paginate(page);
  return { ...result, page: result.page.map(set => ({ id: String(set._id), title: set.title, updatedAt: set.updatedAt, count: set.cards.length, published: !!set.publishedVersionId, revision: set.revision, accent: undefined })) };
} });
