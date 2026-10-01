import { defineTable } from "convex/server";
import { v } from "convex/values";

export const DISCUSSION_LIMITS = { body: 4000, excerpt: 140, threadsPerLesson: 50, commentsPerThread: 100, writesPerMinute: 20 } as const;

/** Anchored discussion: a thread belongs to one lesson, optionally one block. Not a social feed. */
export const discussionTables = {
  learnThreads: defineTable({
    lessonId: v.id("lessons"),
    blockId: v.optional(v.string()),
    anchorExcerpt: v.optional(v.string()),
    authorId: v.string(),
    resolved: v.boolean(),
    createdAt: v.number(),
    lastActivityAt: v.number(),
    commentCount: v.number(),
  }).index("by_lessonId_and_lastActivityAt", ["lessonId", "lastActivityAt"]),
  learnComments: defineTable({
    threadId: v.id("learnThreads"),
    lessonId: v.id("lessons"),
    authorId: v.string(),
    authorName: v.string(),
    body: v.string(),
    createdAt: v.number(),
    editedAt: v.optional(v.number()),
    moderation: v.union(v.literal("ok"), v.literal("removed")),
  }).index("by_threadId_and_createdAt", ["threadId", "createdAt"]),
};
