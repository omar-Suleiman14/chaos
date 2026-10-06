import { defineTable } from "convex/server";
import { v } from "convex/values";
import { communityState } from "./learnModel";

export const counters = v.object({
  saves: v.number(),
  helpful: v.number(),
  views: v.number(),
});
export const progressKey = {
  lessonId: v.id("lessons"),
  versionId: v.optional(v.id("lessonVersions")),
  revision: v.optional(v.number()),
};
export const reportCategory = v.union(
  v.literal("copyright"),
  v.literal("unsafe"),
  v.literal("inaccurate"),
  v.literal("spam"),
  v.literal("privacy"),
);
export const identityStatus = v.union(
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
  v.literal("revoked"),
);
export const claimRole = v.union(v.literal("student"), v.literal("educator"));
export const qualityStatus = v.union(
  v.literal("unreviewed"),
  v.literal("reviewed"),
  v.literal("needs_changes"),
);

/** Parent spreads these into schema.ts. No existing quiz/response data is changed.
 * Limits: 500 completed blocks per revision/version, 500 mappings per concept
 * evidence read, 50 reports/audits per read, two identity roles per account.
 * Text is bounded in mutations (2,000 chars; institution/title 200, slug 100).
 * View engagement is client-reported (15..3,600 seconds), one user/lesson/UTC day.
 * Token identifiers key all new private records; lesson ownership follows the
 * existing subject-based lessonAccess contract. No evidence files or AI calls.
 */
export const communityTables = {
  learnCourseActivity: defineTable({ userKey: v.string(), courseId: v.id("learnCollections"), updatedAt: v.number() }).index("by_userKey_and_courseId", ["userKey", "courseId"]).index("by_userKey_and_updatedAt", ["userKey", "updatedAt"]),
  learnCommunityStats: defineTable({
    lessonId: v.id("lessons"),
    ...counters.fields,
  }).index("by_lessonId", ["lessonId"]),
  learnCommunitySignals: defineTable({
    lessonId: v.id("lessons"),
    userKey: v.string(),
    saved: v.boolean(),
    helpful: v.boolean(),
  }).index("by_lessonId_and_userKey", ["lessonId", "userKey"]),
  learnCommunityViews: defineTable({
    lessonId: v.id("lessons"),
    userKey: v.string(),
    day: v.number(),
    versionId: v.id("lessonVersions"),
    blockId: v.string(),
    recordedAt: v.number(),
  }).index("by_lessonId_and_userKey_and_day", ["lessonId", "userKey", "day"]).index("by_recordedAt", ["recordedAt"]),
  learnProgress: defineTable({
    ...progressKey,
    userKey: v.string(),
    key: v.string(),
    sessionSeq: v.number(),
    writeSeq: v.number(),
    completedBlocks: v.array(v.string()),
    previousCompletedBlocks: v.optional(v.array(v.string())),
    completionAcknowledged: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_userKey_and_lessonId_and_key", ["userKey", "lessonId", "key"]),
  learnConcepts: defineTable({
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    createdBy: v.string(),
  }).index("by_slug", ["slug"]),
  learnConceptMappings: defineTable({
    lessonId: v.id("lessons"),
    versionId: v.id("lessonVersions"),
    blockId: v.string(),
    conceptId: v.id("learnConcepts"),
    questionId: v.optional(v.id("questions")),
  })
    .index(
      "by_lesson_version_block_concept_question",
      ["lessonId", "versionId", "blockId", "conceptId", "questionId"],
    )
    .index("by_lessonId_and_versionId_and_conceptId", [
      "lessonId",
      "versionId",
      "conceptId",
    ])
    .index("by_conceptId", ["conceptId"]),
  learnReports: defineTable({
    lessonId: v.id("lessons"),
    reporterKey: v.string(),
    category: reportCategory,
    detail: v.string(),
    status: v.union(v.literal("open"), v.literal("resolved")),
    createdAt: v.number(),
  })
    .index("by_lessonId_and_reporterKey_and_category", [
      "lessonId",
      "reporterKey",
      "category",
    ])
    .index("by_status", ["status"]).index("by_lessonId_and_status", ["lessonId", "status"]),
  learnModerationAudit: defineTable({
    lessonId: v.id("lessons"),
    actorKey: v.string(),
    action: v.union(
      v.literal("hide"),
      v.literal("review"),
      v.literal("restore"),
      v.literal("remove"),
    ),
    before: communityState,
    after: communityState,
    reason: v.string(),
    createdAt: v.number(),
    reportId: v.optional(v.id("learnReports")),
  }).index("by_lessonId", ["lessonId"]),
  learnAppeals: defineTable({
    lessonId: v.id("lessons"),
    auditId: v.id("learnModerationAudit"),
    ownerKey: v.string(),
    reason: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("accepted"),
      v.literal("denied"),
    ),
    resolution: v.optional(v.string()),
    resolvedBy: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_auditId_and_ownerKey", ["auditId", "ownerKey"]),
  learnAppealAudit: defineTable({
    appealId: v.id("learnAppeals"),
    actorKey: v.string(),
    status: v.union(v.literal("accepted"), v.literal("denied")),
    reason: v.string(),
    createdAt: v.number(),
  }).index("by_appealId", ["appealId"]),
  // Claims are text records only; verification is independent of content quality.
  learnIdentityClaims: defineTable({
    userKey: v.string(),
    role: claimRole,
    institution: v.string(),
    status: identityStatus,
    verifiedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
    method: v.optional(v.literal("manual_review")),
    createdAt: v.number(),
    reason: v.optional(v.string()),
  })
    .index("by_userKey_and_role", ["userKey", "role"])
    .index("by_status", ["status"]),
  learnIdentityAudit: defineTable({
    claimId: v.id("learnIdentityClaims"),
    actorKey: v.string(),
    status: identityStatus,
    reason: v.string(),
    createdAt: v.number(),
  }).index("by_claimId", ["claimId"]),
  learnQuality: defineTable({
    lessonId: v.id("lessons"),
    versionId: v.id("lessonVersions"),
    status: qualityStatus,
    reason: v.string(),
  }).index("by_lessonId_and_versionId", ["lessonId", "versionId"]),
  learnQualityAudit: defineTable({
    lessonId: v.id("lessons"),
    versionId: v.id("lessonVersions"),
    actorKey: v.string(),
    status: qualityStatus,
    reason: v.string(),
    createdAt: v.number(),
  }).index("by_lessonId_and_versionId", ["lessonId", "versionId"]),
};
