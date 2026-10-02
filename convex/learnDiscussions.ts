import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireActiveUser } from "./authz";
import { lessonAccess } from "./lessons";
import { consumeRate } from "./serverUtils";
import { DISCUSSION_LIMITS } from "./learnDiscussionModel";

const comment = v.object({ id: v.id("learnComments"), authorId: v.string(), authorName: v.string(), body: v.string(), createdAt: v.number(), editedAt: v.optional(v.number()), moderation: v.union(v.literal("ok"), v.literal("removed")) });
const thread = v.object({ id: v.id("learnThreads"), lessonId: v.id("lessons"), blockId: v.optional(v.string()), anchorExcerpt: v.optional(v.string()), resolved: v.boolean(), createdAt: v.number(), comments: v.array(comment) });

function cleanBody(body: string) {
  const text = body.trim();
  if (!text) throw new Error("EMPTY: Write something first.");
  if (text.length > DISCUSSION_LIMITS.body) throw new Error(`VALIDATION_FAILED: Keep comments under ${DISCUSSION_LIMITS.body} characters.`);
  return text;
}

/** Anyone who may read the lesson may write; writes are rate limited per person. */
async function writer(ctx: MutationCtx, lessonId: Id<"lessons">) {
  const { identity, user } = await requireActiveUser(ctx);
  await lessonAccess(ctx, lessonId);
  await consumeRate(ctx, `learn:discussion:${identity.subject}`, DISCUSSION_LIMITS.writesPerMinute, 60_000);
  return { id: identity.subject, name: user?.name || user?.username || "Chaos user" };
}

export const listThreads = query({
  args: { lessonId: v.id("lessons") },
  returns: v.array(thread),
  handler: async (ctx, args) => {
    await lessonAccess(ctx, args.lessonId);
    const viewerIdentity = await ctx.auth.getUserIdentity();
    const viewerId = viewerIdentity?.subject;
    const lesson = await ctx.db.get("lessons", args.lessonId);
    const ownerId = lesson?.ownerId;
    const threads = await ctx.db.query("learnThreads").withIndex("by_lessonId_and_lastActivityAt", q => q.eq("lessonId", args.lessonId)).order("desc").take(DISCUSSION_LIMITS.threadsPerLesson);
    return Promise.all(threads.map(async t => {
      const rows = await ctx.db.query("learnComments").withIndex("by_threadId_and_createdAt", q => q.eq("threadId", t._id)).take(DISCUSSION_LIMITS.commentsPerThread);
      return {
        id: t._id, lessonId: t.lessonId, blockId: t.blockId, anchorExcerpt: t.anchorExcerpt, resolved: t.resolved, createdAt: t.createdAt,
        // Removed comments keep their place in the thread without their text. Omit raw internal IDs of other users.
        comments: rows.map(c => {
          const safeAuthorId = (c.authorId === viewerId || c.authorId === ownerId) ? c.authorId : "community_member";
          return { id: c._id, authorId: safeAuthorId, authorName: c.moderation === "removed" ? "" : c.authorName, body: c.moderation === "removed" ? "" : c.body, createdAt: c.createdAt, editedAt: c.editedAt, moderation: c.moderation };
        }),
      };
    }));
  },
});

export const startThread = mutation({
  args: { lessonId: v.id("lessons"), blockId: v.optional(v.string()), anchorExcerpt: v.optional(v.string()), body: v.string() },
  returns: v.id("learnThreads"),
  handler: async (ctx, args) => {
    const me = await writer(ctx, args.lessonId);
    const body = cleanBody(args.body);
    if (args.blockId !== undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(args.blockId)) throw new Error("VALIDATION_FAILED: Invalid block.");
    const count = (await ctx.db.query("learnThreads").withIndex("by_lessonId_and_lastActivityAt", q => q.eq("lessonId", args.lessonId)).take(500)).length;
    if (count >= 500) throw new Error("LIMIT: This lesson has too many discussions. Reply to an existing one.");
    const now = Date.now();
    const threadId = await ctx.db.insert("learnThreads", { lessonId: args.lessonId, blockId: args.blockId, anchorExcerpt: args.anchorExcerpt?.trim().slice(0, DISCUSSION_LIMITS.excerpt) || undefined, authorId: me.id, resolved: false, createdAt: now, lastActivityAt: now, commentCount: 1 });
    await ctx.db.insert("learnComments", { threadId, lessonId: args.lessonId, authorId: me.id, authorName: me.name, body, createdAt: now, moderation: "ok" });
    return threadId;
  },
});

export const reply = mutation({
  args: { threadId: v.id("learnThreads"), body: v.string() },
  returns: v.id("learnComments"),
  handler: async (ctx, args) => {
    const t = await ctx.db.get("learnThreads", args.threadId);
    if (!t) throw new Error("NOT_FOUND: Discussion not found.");
    const me = await writer(ctx, t.lessonId);
    if (t.commentCount >= DISCUSSION_LIMITS.commentsPerThread) throw new Error("LIMIT: This discussion is full. Start a new one.");
    const now = Date.now();
    const id = await ctx.db.insert("learnComments", { threadId: t._id, lessonId: t.lessonId, authorId: me.id, authorName: me.name, body: cleanBody(args.body), createdAt: now, moderation: "ok" });
    await ctx.db.patch("learnThreads", t._id, { lastActivityAt: now, commentCount: t.commentCount + 1 });
    return id;
  },
});

/** The thread starter or the lesson owner can resolve or reopen. */
export const resolve = mutation({
  args: { threadId: v.id("learnThreads"), resolved: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const t = await ctx.db.get("learnThreads", args.threadId);
    if (!t) throw new Error("NOT_FOUND: Discussion not found.");
    const me = await writer(ctx, t.lessonId);
    const lesson = await ctx.db.get("lessons", t.lessonId);
    if (t.authorId !== me.id && lesson?.ownerId !== me.id) throw new Error("FORBIDDEN: Only the person who started this or the lesson owner can resolve it.");
    await ctx.db.patch("learnThreads", t._id, { resolved: args.resolved });
    return null;
  },
});

/** The comment's author or the lesson owner can remove it; the slot stays so replies keep context. */
export const removeComment = mutation({
  args: { commentId: v.id("learnComments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const c = await ctx.db.get("learnComments", args.commentId);
    if (!c) throw new Error("NOT_FOUND: Comment not found.");
    const me = await writer(ctx, c.lessonId);
    const lesson = await ctx.db.get("lessons", c.lessonId);
    if (c.authorId !== me.id && lesson?.ownerId !== me.id) throw new Error("FORBIDDEN: You can only remove your own comments.");
    await ctx.db.patch("learnComments", c._id, { body: "", moderation: "removed" });
    return null;
  },
});
