import { defineTable } from "convex/server";
import { v } from "convex/values";
import { bankChoice, bankKind } from "./questionBankModel";
import { examSettings } from "./examSettingsModel";
import { examAudience } from "./examAudienceModel";
import { integrityDecision, integrityKind, integrityPolicy } from "./examIntegrityModel";
import { accommodationKind, caseDisposition } from "./examInvigilationModel";
import { examMarkingPolicy, examRubricCriterion } from "./examGradingModel";
import { frozenResultPolicy } from "./examResultModel";

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
  marking: v.optional(examMarkingPolicy),
  rubricCriteria: v.optional(v.array(examRubricCriterion)),
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
    audience: v.optional(examAudience),
    audienceRevision: v.optional(v.number()),
    assignmentActive: v.optional(v.boolean()),
    assignedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_draft", ["draftId"]).index("by_course", ["courseId"]),
  /** Versioned student rules acknowledgements, not attempt authorizations. */
  examConsents: defineTable({
    releaseId: v.id("examReleases"),
    studentId: v.string(),
    snapshotId: v.id("examSnapshots"),
    policyVersion: v.string(),
    rulesVersion: v.number(),
    acceptedAt: v.number(),
    revision: v.number(),
  }).index("by_release_student", ["releaseId", "studentId"]),
  /** Attempts always bind a specific snapshot, not a live question or mutable release pointer. */
  /** One authoritative answer per question per attempt. No answer keys are stored here. */
  examAttemptAnswers: defineTable({
    attemptId: v.id("examAttempts"),
    snapshotId: v.id("examSnapshots"),
    studentId: v.string(),
    questionIndex: v.number(),
    choiceIds: v.array(v.string()),
    text: v.string(),
    flagged: v.boolean(),
    savedForLater: v.boolean(),
    revision: v.number(),
    lastMutationId: v.string(),
    savedAt: v.number(),
  })
    .index("by_attempt_question", ["attemptId", "questionIndex"]),
  /** Immutable completion proof; never contains answers, keys or private media. */
  examSubmissionReceipts: defineTable({
    attemptId: v.id("examAttempts"),
    studentId: v.string(),
    snapshotId: v.id("examSnapshots"),
    outcome: v.union(v.literal("submitted"), v.literal("expired")),
    reason: v.union(v.literal("student"), v.literal("timeout")),
    completedAt: v.number(),
    answeredCount: v.number(),
    questionCount: v.number(),
    startedAt: v.number(),
    deadlineAt: v.number(),
  }).index("by_attempt", ["attemptId"]),
  /** Private grading ledger; never returned in student receipts or general course APIs. */
  examGrades: defineTable({
    attemptId: v.id("examAttempts"),
    snapshotId: v.id("examSnapshots"),
    ownerId: v.string(),
    studentId: v.string(),
    state: v.union(v.literal("auto_final"), v.literal("needs_manual")),
    earnedCents: v.number(),
    maximumCents: v.number(),
    objectiveMaximumCents: v.number(),
    pendingWrittenCount: v.number(),
    finalPercentBasisPoints: v.optional(v.number()),
    entries: v.array(v.object({
      questionIndex: v.number(),
      status: v.union(v.literal("scored"), v.literal("needs_manual")),
      pointsAvailableCents: v.number(),
      pointsAwardedCents: v.number(),
    })),
    algorithmVersion: v.number(),
    resultPolicy: v.optional(frozenResultPolicy),
    gradedAt: v.number(),
    revision: v.optional(v.number()),
    finalizedAt: v.optional(v.number()),
  }).index("by_attempt", ["attemptId"]),
  /** Teacher-private criterion scores and moderation; never candidate-addressable. */
  examEssayMarks: defineTable({
    attemptId: v.id("examAttempts"), snapshotId: v.id("examSnapshots"),
    ownerId: v.string(), studentId: v.string(), questionIndex: v.number(),
    criterionScores: v.array(v.object({ criterionId: v.string(), scorePercent: v.number() })),
    holisticAwardCents: v.optional(v.number()), awardedCents: v.number(),
    feedback: v.string(),
    status: v.union(v.literal("draft"), v.literal("submitted"),
      v.literal("changes_requested"), v.literal("approved")),
    moderationNote: v.optional(v.string()), revision: v.number(), updatedAt: v.number(),
  }).index("by_attempt_question", ["attemptId", "questionIndex"]),
  /** Append-only marking decisions, including rejected draft modifications. */
  examEssayMarkAudit: defineTable({
    attemptId: v.id("examAttempts"), snapshotId: v.id("examSnapshots"),
    ownerId: v.string(), studentId: v.string(), questionIndex: v.number(),
    actorId: v.string(),
    action: v.union(v.literal("save"), v.literal("submit"), v.literal("approve"),
      v.literal("changes_requested"), v.literal("finalize")),
    revision: v.number(), detail: v.string(), at: v.number(),
  }).index("by_attempt_at", ["attemptId", "at"]),
  /** Manual release applies to one immutable snapshot; never changes the grade ledger. */
  examResultPublications: defineTable({
    snapshotId: v.id("examSnapshots"),
    courseId: v.id("learnCollections"),
    ownerId: v.string(),
    released: v.boolean(),
    revision: v.number(),
    updatedAt: v.number(),
    releasedAt: v.optional(v.number()),
  }).index("by_snapshot", ["snapshotId"]),
  /** Immutable publication/revocation audit for owner review and incident response. */
  examResultPublicationAudit: defineTable({
    snapshotId: v.id("examSnapshots"),
    courseId: v.id("learnCollections"),
    ownerId: v.string(),
    actorId: v.string(),
    action: v.union(v.literal("publish"), v.literal("withhold")),
    revision: v.number(),
    at: v.number(),
  }).index("by_snapshot_at", ["snapshotId", "at"]),
  /** Short-lived, privacy-minimized, non-punitive browser telemetry only. */
  examIntegrityEvents: defineTable({
    attemptId: v.id("examAttempts"),
    eventId: v.string(),
    kind: integrityKind,
    observedAt: v.number(),
    decision: integrityDecision,
    gapMs: v.optional(v.number()),
    expiresAt: v.number(),
  })
    .index("by_attempt_time", ["attemptId", "observedAt"])
    .index("by_attempt_event", ["attemptId", "eventId"]),
  /** Student-explainable, instructor-reviewed cases. Deliberately has no guilty verdict. */
  examIntegrityCases: defineTable({
    attemptId: v.id("examAttempts"), eventId: v.string(),
    ownerId: v.string(), studentId: v.string(),
    disposition: caseDisposition,
    studentExplanation: v.optional(v.string()),
    revision: v.number(), createdAt: v.number(), updatedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_attempt_event", ["attemptId", "eventId"])
    .index("by_attempt_updated", ["attemptId", "updatedAt"]),
  /** Append-only review and intervention audit, automatically expires after 30 days. */
  examInvigilationAudit: defineTable({
    attemptId: v.id("examAttempts"),
    ownerId: v.string(), studentId: v.string(), actorId: v.string(),
    action: v.union(
      v.literal("case_opened"), v.literal("student_explanation"),
      v.literal("reviewed"), v.literal("time_extension"),
      v.literal("connectivity_acknowledged"), v.literal("candidate_contacted"),
    ),
    detail: v.string(), at: v.number(), expiresAt: v.number(),
  }).index("by_attempt_at", ["attemptId", "at"]),
  /** Pre-start accommodations; live changes require separately audited interventions. */
  examAccommodations: defineTable({
    releaseId: v.id("examReleases"), studentId: v.string(), ownerId: v.string(),
    kind: accommodationKind, additionalMinutes: v.number(),
    revision: v.number(), updatedAt: v.number(),
  }).index("by_release_student", ["releaseId", "studentId"]),
  /** Audit accommodation changes without storing medical history. */
  examAccommodationAudit: defineTable({
    releaseId: v.id("examReleases"), ownerId: v.string(), studentId: v.string(),
    actorId: v.string(), kind: accommodationKind, additionalMinutes: v.number(),
    revision: v.number(), at: v.number(), expiresAt: v.number(),
  }).index("by_release_at", ["releaseId", "at"]),
  examAttempts: defineTable({
    ownerId: v.string(),
    courseId: v.id("learnCollections"),
    snapshotId: v.id("examSnapshots"),
    studentId: v.string(),
    state: attemptState,
    revision: v.number(),
    startedAt: v.number(),
    /** Privacy-first opt-in policy, frozen by a future authorized start transaction. */
    integrityPolicy: v.optional(integrityPolicy),
    /** Server-side open intervals, never trusted from browser timing. */
    integritySignals: v.optional(v.object({
      awayAt: v.optional(v.number()),
      offlineAt: v.optional(v.number()),
      fullscreenAt: v.optional(v.number()),
    })),
    /** Frozen when the server starts the attempt; missing on legacy/test seed rows. */
    deadlineAt: v.optional(v.number()),
    minimumSubmitAt: v.optional(v.number()),
    submissionPolicy: v.optional(v.object({
      allowEarlySubmission: v.boolean(),
      requireAllAnswers: v.boolean(),
      timeoutAction: v.union(v.literal("auto_submit"), v.literal("expire")),
    })),
    submitConfirmation: v.optional(v.object({
      id: v.string(), expiresAt: v.number(), answerStamp: v.string(),
      expectedRevision: v.number(),
    })),
    submissionId: v.optional(v.string()),
    updatedAt: v.number(),
    submittedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
  })
    .index("by_snapshot_student", ["snapshotId", "studentId"])
    .index("by_student_updated", ["studentId", "updatedAt"]),
};
