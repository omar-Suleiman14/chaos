import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Separate namespace and private bucket: no legacy source URL or old public
 * source grant can authorize course media. The source migration is separate.
 */
export const courseMediaTables = {
  courseMediaObjects: defineTable({
    courseId: v.id("learnCollections"),
    lessonId: v.id("lessons"),
    ownerId: v.string(),
    mimeType: v.string(),
    bytes: v.number(),
    status: v.union(v.literal("pending"), v.literal("ready"), v.literal("removed")),
    etag: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_course", ["courseId"])
    .index("by_lesson", ["lessonId"])
    .index("by_owner", ["ownerId"]),
};
