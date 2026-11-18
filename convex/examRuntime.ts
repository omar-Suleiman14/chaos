import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireEligiblePreflight } from "./examPreflight";
import { createExamAttemptTiming } from "./examSubmissionModel";
import { makeIntegrityPolicy } from "./examIntegrityModel";
import { freezeResultPolicy } from "./examResultModel";
import { authorizedAttempt } from "./examAnswers";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireActiveUser, creatorRestricted } from "./authz";
import { hasApprovedCourseAccess } from "./courseMembership";
import { eligibleByRow, loadPool, validatePlan, validateSelections } from "./examBuilder";
import { transitionExamAttempt } from "./examAttemptState";
import { attemptState } from "./examRuntimeModel";

type Ctx = QueryCtx | MutationCtx;
const MAX_SNAPSHOT_BYTES = 360_000;
const MAX_SNAPSHOTS_PER_DRAFT = 20;

async function authenticated(ctx: Ctx) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  return identity.subject;
}
async function ownedDraft(ctx: Ctx, draftId: Id<"examBuilderDrafts">, trustedActorId?: string) {
  const ownerId = trustedActorId ?? await authenticated(ctx);
  const draft = await ctx.db.get("examBuilderDrafts", draftId);
  if (!draft || draft.ownerId !== ownerId) throw new Error("NOT_FOUND: Exam draft not found.");
  const course = await ctx.db.get("learnCollections", draft.courseId);
  if (!course || course.ownerId !== ownerId || course.archived || course.communityState === "removed")
    throw new Error("NOT_FOUND: Active owned course not found.");
  if (await creatorRestricted(ctx, ownerId)) throw new Error("FORBIDDEN: Account restricted.");
  return { ownerId, draft, course };
}
async function ownedSnapshot(ctx: Ctx, snapshotId: Id<"examSnapshots">) {
  const ownerId = await authenticated(ctx);
  const snapshot = await ctx.db.get("examSnapshots", snapshotId);
  if (!snapshot || snapshot.ownerId !== ownerId) throw new Error("NOT_FOUND: Snapshot not found.");
  const course = await ctx.db.get("learnCollections", snapshot.courseId);
  if (!course || course.ownerId !== ownerId) throw new Error("NOT_FOUND: Snapshot not found.");
  return snapshot;
}

/** The only snapshot writer. No content patching, mutable bank refs, or student key reads. */
export const sealDraft = mutation({
  args: { draftId: v.id("examBuilderDrafts"), expectedRevision: v.number() },
  returns: v.object({ snapshotId: v.id("examSnapshots"), version: v.number() }),
  handler: (ctx, args) => forMcpSealDraft(ctx, args),
});

export async function forMcpSealDraft(ctx: MutationCtx, args: { draftId: Id<"examBuilderDrafts">; expectedRevision: number }, trustedActorId?: string) {
  const { draftId, expectedRevision } = args;
    const { ownerId, draft, course } = await ownedDraft(ctx, draftId, trustedActorId);
    if (!Number.isSafeInteger(expectedRevision) || draft.revision !== expectedRevision)
      throw new Error("REVISION_CONFLICT: Reload the exam before sealing.");
    const release = await ctx.db.query("examReleases")
      .withIndex("by_draft", q => q.eq("draftId", draftId)).unique();
    if (release && (release.ownerId !== ownerId || release.courseId !== draft.courseId))
      throw new Error("NOT_FOUND: Invalid release owner.");
    const prior = release ? await ctx.db.get("examSnapshots", release.activeSnapshotId) : null;
    if (prior?.draftRevision === expectedRevision)
      return { snapshotId: prior._id, version: prior.version };
    if (release?.studentEntryEnabled || (release && await ctx.db.query("examAttempts")
      .withIndex("by_snapshot_state", q => q.eq("snapshotId", release.activeSnapshotId).eq("state", "in_progress")).first()))
      throw new Error("EXAM_ACTIVE: Close entry and finish active attempts before resealing.");
    const version = (release?.version ?? 0) + 1;
    if (version > MAX_SNAPSHOTS_PER_DRAFT)
      throw new Error("LIMIT_REACHED: This draft has reached its sealed version limit.");
    validatePlan(course, draft.title, draft.targetCount, draft.allocations);
    if (draft.allocations.reduce((sum, row) => sum + row.count, 0) !== draft.targetCount ||
      draft.selections.length !== draft.targetCount)
      throw new Error("INCOMPLETE_EXAM: Select exactly the target question count.");
    const pool = await loadPool(ctx, course, ownerId);
    const groups = eligibleByRow(pool, draft.allocations);
    validateSelections(draft.selections, draft.allocations, groups, draft.targetCount);
    for (const allocation of draft.allocations) {
      if (draft.selections.filter(s => s.allocationId === allocation.id).length !== allocation.count)
        throw new Error("INCOMPLETE_EXAM: Complete every syllabus allocation.");
    }
    const byId = new Map(pool.map(row => [row.question._id, row.question]));
    const questions = [];
    for (const selection of draft.selections) {
      const question = byId.get(selection.questionId);
      const allocation = draft.allocations.find(row => row.id === selection.allocationId);
      if (!question || !allocation || question.status !== "ready")
        throw new Error("STALE_QUESTION: A selected question is no longer eligible.");
      const media = [];
      for (const image of question.caseStudy?.media ?? []) {
        const asset = await ctx.db.get("questionBankMedia", image.mediaId);
        if (!asset || asset.ownerId !== ownerId || asset.status !== "ready" || !asset.etag ||
          !["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType))
          throw new Error("MEDIA_UNAVAILABLE: Reverify clinical images before sealing.");
        media.push({ mediaId: image.mediaId, alt: image.alt,
          mimeType: asset.mimeType, bytes: asset.bytes, etag: asset.etag });
      }
      questions.push({
        sourceQuestionId: question._id, sourceRevision: question.revision,
        allocationId: selection.allocationId,
        kind: question.kind, prompt: question.prompt,
        choices: question.choices, correctChoiceIds: question.correctChoiceIds,
        ...(question.sampleAnswer !== undefined ? { sampleAnswer: question.sampleAnswer } : {}),
        ...(question.explanation !== undefined ? { explanation: question.explanation } : {}),
        points: allocation.points,
        ...(allocation.marking ? { marking: allocation.marking } : {}),
        ...(question.rubricCriteria ? { rubricCriteria: question.rubricCriteria } : {}),
        topics: question.topics, terms: question.terms,
        outcomes: question.outcomes,
        ...(question.caseStudy ? { caseStudy: { stem: question.caseStudy.stem, media } } : {}),
      });
    }
    if (new TextEncoder().encode(JSON.stringify(questions)).byteLength > MAX_SNAPSHOT_BYTES)
      throw new Error("LIMIT_REACHED: Exam content exceeds the snapshot size limit.");
    const totalPoints = Math.round(questions.reduce((sum, q) => sum + q.points, 0) * 100) / 100;
    const now = Date.now();
    const snapshotId = await ctx.db.insert("examSnapshots", {
      ownerId, courseId: course._id, draftId, draftRevision: draft.revision,
      version, title: draft.title, questions, totalPoints, sealedAt: now,
    });
    if (release) await ctx.db.patch("examReleases", release._id, {
      activeSnapshotId: snapshotId, version, preparedForAudience: false,
      assignmentActive: false, studentEntryEnabled: false, updatedAt: now,
    });
    else await ctx.db.insert("examReleases", {
      ownerId, courseId: course._id, draftId, activeSnapshotId: snapshotId, version,
      studentEntryEnabled: false, preparedForAudience: false, createdAt: now, updatedAt: now,
    });
    return { snapshotId, version };
}


/** Private creator access includes keys; never reuse in a student or public transport. */
export const getOwnerSnapshot = query({
  args: { snapshotId: v.id("examSnapshots") },
  handler: async (ctx, { snapshotId }) => ownedSnapshot(ctx, snapshotId),
});
export const listSealed = query({
  args: { courseId: v.id("learnCollections") },
  handler: async (ctx, { courseId }) => {
    const ownerId = await authenticated(ctx);
    const course = await ctx.db.get("learnCollections", courseId);
    if (!course || course.ownerId !== ownerId) throw new Error("NOT_FOUND: Course not found.");
    const rows = await ctx.db.query("examSnapshots")
      .withIndex("by_owner_course_sealed", q => q.eq("ownerId", ownerId).eq("courseId", courseId))
      .order("desc").take(100);
    return rows.map(row => ({
      snapshotId: row._id, draftId: row.draftId, version: row.version,
      title: row.title, questionCount: row.questions.length, totalPoints: row.totalPoints,
      sealedAt: row.sealedAt,
    }));
  },
});

export const listDraftSnapshots = query({
  args: { draftId: v.id("examBuilderDrafts") },
  handler: async (ctx, { draftId }) => {
    const ownerId = await authenticated(ctx);
    const draft = await ctx.db.get("examBuilderDrafts", draftId);
    const course = draft ? await ctx.db.get("learnCollections", draft.courseId) : null;
    if (!draft || draft.ownerId !== ownerId || !course || course.ownerId !== ownerId ||
        course.communityState === "removed" || await creatorRestricted(ctx, ownerId))
      throw new Error("NOT_FOUND: Exam draft not found.");
    const rows = await ctx.db.query("examSnapshots")
      .withIndex("by_draft_version", q => q.eq("draftId", draftId)).order("desc").take(MAX_SNAPSHOTS_PER_DRAFT);
    return rows.map(row => ({ snapshotId: row._id, version: row.version, title: row.title, sealedAt: row.sealedAt }));
  },
});

/** Atomically validate entry, resume an active attempt, or consume one attempt. */
export const startAttempt = mutation({
  args: { snapshotId: v.id("examSnapshots") },
  returns: v.id("examAttempts"),
  handler: async (ctx, { snapshotId }) => {
    const snapshot = await ctx.db.get("examSnapshots", snapshotId);
    if (!snapshot) throw new Error("NOT_FOUND: Exam not found.");
    const release = await ctx.db.query("examReleases")
      .withIndex("by_draft", q => q.eq("draftId", snapshot.draftId)).unique();
    if (!release || release.activeSnapshotId !== snapshotId || !release.assignmentActive || !release.audience)
      throw new Error("EXAM_NOT_ASSIGNED: Exam entry is closed.");
    const eligible = await requireEligiblePreflight(ctx, release._id);
    if (eligible.snapshot._id !== snapshotId ||
        (eligible.settings.mode === "scheduled" && eligible.settings.opensAt! > eligible.now))
      throw new Error("EXAM_CLOSED: Exam is not open yet.");
    const attempts = await ctx.db.query("examAttempts")
      .withIndex("by_snapshot_student", q => q.eq("snapshotId", snapshotId)
        .eq("studentId", eligible.studentId)).take(4);
    const active = attempts.find(a => a.state === "in_progress");
    if (!release.studentEntryEnabled && !active)
      throw new Error("EXAM_NOT_ASSIGNED: Exam entry is closed.");
    if (!active && attempts.length >= eligible.settings.maxAttempts)
      throw new Error("ATTEMPT_LIMIT: No attempts remain.");
    const consent = await ctx.db.query("examConsents")
      .withIndex("by_release_student", q => q.eq("releaseId", release._id)
        .eq("studentId", eligible.studentId)).unique();
    if (!consent || consent.snapshotId !== snapshotId ||
        (!active?.entryAuthorized && consent.policyVersion !== eligible.policyVersion))
      throw new Error("CONSENT_REQUIRED: Accept the current exam rules.");
    if (active) {
      if (!active.deadlineAt || active.deadlineAt <= eligible.now)
        throw new Error("ATTEMPT_TIMED_OUT: Wait for the attempt to close.");
      return active._id;
    }
    const { accommodation } = eligible;
    if (accommodation && accommodation.ownerId !== snapshot.ownerId)
      throw new Error("INTEGRITY_ERROR: Accommodation owner mismatch.");
    const extra = accommodation?.kind === "extra_time" ? accommodation.additionalMinutes : 0;
    const durationMinutes = eligible.settings.durationMinutes + extra;
    const timing = createExamAttemptTiming({ ...eligible.settings, durationMinutes }, eligible.now);
    const attemptId = await ctx.db.insert("examAttempts", {
      ownerId: snapshot.ownerId, courseId: snapshot.courseId, snapshotId,
      studentId: eligible.studentId, state: "in_progress", entryAuthorized: true, revision: 0,
      startedAt: eligible.now, updatedAt: eligible.now, ...timing,
      integrityPolicy: makeIntegrityPolicy(accommodation?.kind === "reduced_monitoring"
        ? "off" : eligible.settings.integrityMode ?? "off"), resultPolicy: freezeResultPolicy(eligible.settings),
    });
    await ctx.scheduler.runAt(timing.deadlineAt, internal.examSubmissions.finalizeAtDeadline,
      { attemptId, deadlineAt: timing.deadlineAt });
    return attemptId;
  },
});

/** Only candidate-facing fields; frozen keys, explanations and rubrics stay server-side. */
export const getQuestions = query({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    const { snapshot } = await authorizedAttempt(ctx, attemptId);
    return { title: snapshot.title, questions: snapshot.questions.map((q, index) => ({
      index, kind: q.kind, prompt: q.prompt,
      choices: q.kind === "true_false" ? [{ id: "true", text: "True" }, { id: "false", text: "False" }] : q.choices,
      caseStudy: q.caseStudy ? { stem: q.caseStudy.stem,
        media: q.caseStudy.media.map(m => ({ mediaId: m.mediaId, alt: m.alt })) } : null,
    })) };
  },
});

/** Metadata-only projection; never return a question, explanation or marking key. */
export const getMyAttempt = query({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    const studentId = await authenticated(ctx);
    const attempt = await ctx.db.get("examAttempts", attemptId);
    if (!attempt || attempt.studentId !== studentId ||
      !(await hasApprovedCourseAccess(ctx, attempt.courseId, studentId)))
      throw new Error("NOT_FOUND: Attempt not found.");
    return {
      attemptId: attempt._id, snapshotId: attempt.snapshotId, state: attempt.state,
      revision: attempt.revision, startedAt: attempt.startedAt,
      updatedAt: attempt.updatedAt, submittedAt: attempt.submittedAt,
      closedAt: attempt.closedAt, integrityMode: attempt.integrityPolicy?.mode ?? "off",
      telemetryConsented: attempt.entryAuthorized === true,
    };
  },
});

/** Internal lifecycle primitive, not a public submit endpoint. PR 18 owns user submission rules. */
export const closeAttemptInternal = internalMutation({
  args: { attemptId: v.id("examAttempts"), expectedRevision: v.number(),
    nextState: v.union(v.literal("submitted"), v.literal("expired"), v.literal("void")) },
  returns: v.object({ state: attemptState, revision: v.number() }),
  handler: async (ctx, { attemptId, expectedRevision, nextState }) => {
    const attempt = await ctx.db.get("examAttempts", attemptId);
    if (!attempt) throw new Error("NOT_FOUND: Attempt not found.");
    if (!Number.isSafeInteger(expectedRevision) || attempt.revision !== expectedRevision)
      throw new Error("REVISION_CONFLICT: Attempt state has changed.");
    if (!transitionExamAttempt(attempt.state, nextState))
      return { state: attempt.state, revision: attempt.revision };
    const now = Date.now();
    await ctx.db.patch("examAttempts", attemptId, {
      state: nextState, revision: attempt.revision + 1, updatedAt: now,
      closedAt: now, ...(nextState === "submitted" ? { submittedAt: now } : {}),
    });
    return { state: nextState, revision: attempt.revision + 1 };
  },
});
