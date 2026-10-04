// Actor comes only from the secret-protected MCP envelope.
import { courseModule } from "./learnAssetModel";
import { setCourseModules, readCourseProgress } from "./courses";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireLearnActor } from "./mcpLearn";
import { createCourse, getCourse, updateCourse, setOutlineCourse, addLessonCourse, publishCourse, setCourseArchived, unpublishCourse, courseCard, toCourseCard } from "./courses";
import { visibility } from "./learnModel";
export const create = internalMutation({
 args: { userId: v.string(), title: v.optional(v.string()), language: v.optional(v.string()) },
 returns: v.object({ courseId: v.id("learnCollections") }),
 handler: async (ctx, { userId, ...input }) => {
 const actor = await requireLearnActor(ctx, userId);
 return ({ courseId: await createCourse(ctx, input, actor) });
 },
});
export const read = internalQuery({
 args: { userId: v.string(), courseId: v.id("learnCollections") },
 returns: v.object({ id: v.id("learnCollections"), title: v.string(), description: v.string(), coverUrl: v.optional(v.string()), coverY: v.optional(v.number()), icon: v.optional(v.string()), language: v.string(), tags: v.array(v.string()), visibility, published: v.boolean(), publishedAt: v.union(v.number(), v.null()), canPrivate: v.boolean(), modules: v.array(courseModule), lessons: v.array(v.object({ id: v.id("lessons"), title: v.string(), description: v.string(), published: v.boolean(), changed: v.boolean(), blocks: v.number() })), revision: v.number() }),
 handler: async (ctx, { userId, ...input }) => {
 const actor = await requireLearnActor(ctx, userId);
 return await getCourse(ctx, input, actor);
 },
});
export const update = internalMutation({
 args: { userId: v.string(), courseId: v.id("learnCollections"), title: v.optional(v.string()), description: v.optional(v.string()), coverUrl: v.optional(v.union(v.string(), v.null())), coverY: v.optional(v.union(v.number(), v.null())), icon: v.optional(v.union(v.string(), v.null())), language: v.optional(v.string()), tags: v.optional(v.array(v.string())) },
 returns: v.object({ ok: v.boolean() }),
 handler: async (ctx, { userId, ...input }) => {
 const actor = await requireLearnActor(ctx, userId);
 await updateCourse(ctx, input, actor); return { ok: true };
 },
});
export const setOutline = internalMutation({
 args: { userId: v.string(), courseId: v.id("learnCollections"), lessonIds: v.array(v.id("lessons")) },
 returns: v.object({ ok: v.boolean() }),
 handler: async (ctx, { userId, ...input }) => {
 const actor = await requireLearnActor(ctx, userId);
 await setOutlineCourse(ctx, input, actor); return { ok: true };
 },
});
export const addLesson = internalMutation({
 args: { userId: v.string(), courseId: v.id("learnCollections"), title: v.optional(v.string()) },
 returns: v.object({ lessonId: v.id("lessons") }),
 handler: async (ctx, { userId, ...input }) => {
 const actor = await requireLearnActor(ctx, userId);
 return ({ lessonId: await addLessonCourse(ctx, input, actor) });
 },
});
export const publish = internalMutation({
 args: { userId: v.string(), courseId: v.id("learnCollections"), visibility: visibility },
 returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), problems: v.array(v.object({ lessonId: v.id("lessons"), title: v.string(), message: v.string() })) })),
 handler: async (ctx, { userId, ...input }) => {
 const actor = await requireLearnActor(ctx, userId);
 return await publishCourse(ctx, input, actor);
 },
});
export const list = internalQuery({
 args: { userId: v.string(), limit: v.optional(v.number()), cursor: v.optional(v.string()) },
 returns: v.object({ courses: v.array(courseCard), nextCursor: v.union(v.string(), v.null()) }),
 handler: async (ctx, { userId, limit = 20, cursor }) => {
 const actor = await requireLearnActor(ctx, userId);
 if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (cursor?.length ?? 0) > 2000) throw new Error("VALIDATION_FAILED: Use a limit from 1 to 50 and a cursor from the previous page.");
 const page = await ctx.db.query("learnCollections").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", actor)).order("desc").paginate({ numItems: limit, cursor: cursor ?? null });
 return { courses: page.page.map(toCourseCard), nextCursor: page.isDone ? null : page.continueCursor };
 },
});
export const setArchived = internalMutation({
 args: { userId: v.string(), courseId: v.id("learnCollections"), archived: v.boolean() },
 returns: v.object({ ok: v.boolean(), archived: v.boolean() }),
 handler: async (ctx, { userId, ...input }) => {
 const actor = await requireLearnActor(ctx, userId);
 await setCourseArchived(ctx, input, actor); return { ok: true, archived: input.archived };
 },
});
export const unpublish = internalMutation({
 args: { userId: v.string(), courseId: v.id("learnCollections") },
 returns: v.object({ ok: v.boolean() }),
 handler: async (ctx, { userId, ...input }) => {
 const actor = await requireLearnActor(ctx, userId);
 await unpublishCourse(ctx, input, actor); return { ok: true };
 },
});

export const modules = internalMutation({ args: { userId: v.string(), courseId: v.id("learnCollections"), modules: v.array(courseModule) }, returns: v.object({ ok: v.boolean() }), handler: async (ctx, { userId, ...args }) => { const actor = await requireLearnActor(ctx, userId); await setCourseModules(ctx, args, actor); return { ok: true }; } });
export const progress = internalQuery({ args: { userId: v.string(), courseId: v.id("learnCollections") }, returns: v.object({ lessons: v.array(v.object({ lessonId: v.id("lessons"), completed: v.boolean(), percent: v.number() })) }), handler: async (ctx, { userId, ...args }) => { const actor = await requireLearnActor(ctx, userId); return { lessons: await readCourseProgress(ctx, args, actor) }; } });
