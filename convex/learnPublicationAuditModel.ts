import { defineTable } from "convex/server";
import { v } from "convex/values";

export const publicationAction = v.union(v.literal("create"), v.literal("publish"), v.literal("restore_draft"), v.literal("archive"), v.literal("unpublish"), v.literal("reactivate"), v.literal("fork"));
export const auditedAsset = v.union(v.object({ kind: v.literal("collection"), id: v.id("learnCollections") }), v.object({ kind: v.literal("flashcards"), id: v.id("flashcardSets") }));
export const publicationAuditTables = {
  learnAssetPublicationAudit: defineTable({ asset: auditedAsset, actorId: v.string(), action: publicationAction, revision: v.number(), versionId: v.optional(v.union(v.id("collectionVersions"), v.id("flashcardVersions"))), beforeVisibility: v.optional(v.string()), afterVisibility: v.string(), reason: v.string(), createdAt: v.number() }).index("by_asset", ["asset"]),
  learnPublicationAudit: defineTable({
    lessonId: v.id("lessons"), actorId: v.string(), action: publicationAction,
    revision: v.number(), versionId: v.optional(v.id("lessonVersions")),
    parentLessonId: v.optional(v.id("lessons")),
    beforeVisibility: v.optional(v.string()), afterVisibility: v.string(),
    reason: v.string(), createdAt: v.number(),
  }).index("by_lessonId", ["lessonId"]),
};
