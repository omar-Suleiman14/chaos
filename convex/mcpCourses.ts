// Actor comes only from the secret-protected MCP envelope.
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireLearnActor } from "./mcpLearn";
import { createCourse, getCourse, updateCourse, setOutlineCourse, addLessonCourse, publishCourse } from "./courses";
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
 returns: v.object({ id: v.id("learnCollections"), title: v.string(), description: v.string(), coverUrl: v.optional(v.string()), language: v.string(), tags: v.array(v.string()), visibility, published: v.boolean(), publishedAt: v.union(v.number(), v.null()), canPrivate: v.boolean(), lessons: v.array(v.object({ id: v.id("lessons"), title: v.string(), description: v.string(), published: v.boolean(), changed: v.boolean(), blocks: v.number() })), revision: v.number() }),
 handler: async (ctx, { userId, ...input }) => {
 const actor = await requireLearnActor(ctx, userId);
 return await getCourse(ctx, input, actor);
 },
});
export const update = internalMutation({
 args: { userId: v.string(), courseId: v.id("learnCollections"), title: v.optional(v.string()), description: v.optional(v.string()), coverUrl: v.optional(v.union(v.string(), v.null())), language: v.optional(v.string()), tags: v.optional(v.array(v.string())) },
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
