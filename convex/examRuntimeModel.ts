import { defineTable } from "convex/server";
import { v } from "convex/values";
import { bankChoice, bankKind } from "./questionBankModel";
import { examSettings } from "./examSettingsModel";

/** A sealed snapshot is append-only: no public update/delete API may mutate its content or key. */
export const frozenQuestion = v.object({
  sourceQuestionId: v.id("questionBankItems"),
  sourceRevision: v.number(),
  allocationId: v.string(),
  kind: bankKind,
  prompt: v.string(),
  choices: v.array(bankChoice),
  correctChoiceIds: v.array(v.string()),
  sampleAnswer: v.optional(v.string()),
  explanation: v.optional(v.string()),
  points: v.number(),
  topics: v.array(v.string()),
  terms: v.array(v.string()),
  outcomes: v.array(v.string()),
  caseStudy: v.optional(v.object({
    stem: v.string(),
    media: v.array(v.object({
      mediaId: v.id("questionBankMedia"), alt: v.string(),
      mimeType: v.string(), bytes: v.number(), etag: v.string(),
    })),
  })),
});

export const attemptState = v.union(
  v.literal("in_progress"), v.literal("submitted"),
  v.literal("expired"), v.literal("void"),
);

export const examRuntimeTables = {
  examSnapshots: defineTable({
    ownerId: v.string(),
    courseId: v.id("learnCollections"),
    draftId: v.id("examBuilderDrafts"),
    draftRevision: v.number(),
    version: v.number(),
    title: v.string(),
    questions: v.array(frozenQuestion),
    totalPoints: v.number(),
    sealedAt: v.number(),
  })
    .index("by_draft_version", ["draftId", "version"])
    .index("by_owner_course_sealed", ["ownerId", "courseId", "sealedAt"]),
  /** Mutable pointer, never student-activated by this PR. Audience is mandatory in PR 14. */
  examReleases: defineTable({
    ownerId: v.string(),
    courseId: v.id("learnCollections"),
    draftId: v.id("examBuilderDrafts"),
    activeSnapshotId: v.id("examSnapshots"),
    version: v.number(),
    studentEntryEnabled: v.boolean(),
    /** Explicit release policy defaults to unconfigured; never implicitly activates exams. */
    settings: v.optional(examSettings),
    settingsRevision: v.optional(v.number()),
    preparedForAudience: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_draft", ["draftId"]),
  /** Attempts always bind a specific snapshot, not a live question or mutable release pointer. */
  examAttempts: defineTable({
    ownerId: v.string(),
    courseId: v.id("learnCollections"),
    snapshotId: v.id("examSnapshots"),
    studentId: v.string(),
    state: attemptState,
    revision: v.number(),
    startedAt: v.number(),
    updatedAt: v.number(),
    submittedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
  })
    .index("by_snapshot_student", ["snapshotId", "studentId"])
    .index("by_student_updated", ["studentId", "updatedAt"]),
};
