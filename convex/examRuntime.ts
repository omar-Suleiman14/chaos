import { v } from "convex/values";
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
async function ownedDraft(ctx: Ctx, draftId: Id<"examBuilderDrafts">) {
  const ownerId = await authenticated(ctx);
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
  handler: async (ctx, { draftId, expectedRevision }) => {
    const { ownerId, draft, course } = await ownedDraft(ctx, draftId);
    if (!Number.isSafeInteger(expectedRevision) || draft.revision !== expectedRevision)
      throw new Error("REVISION_CONFLICT: Reload the exam before sealing.");
    const release = await ctx.db.query("examReleases")
      .withIndex("by_draft", q => q.eq("draftId", draftId)).unique();
    if (release && (release.ownerId !== ownerId || release.courseId !== draft.courseId))
      throw new Error("NOT_FOUND: Invalid release owner.");
    const prior = release ? await ctx.db.get("examSnapshots", release.activeSnapshotId) : null;
    if (prior?.draftRevision === expectedRevision)
      return { snapshotId: prior._id, version: prior.version };
    if (release?.studentEntryEnabled)
      throw new Error("EXAM_ACTIVE: Close the student release before resealing.");
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
        points: allocation.points, topics: question.topics, terms: question.terms,
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
      activeSnapshotId: snapshotId, version, preparedForAudience: false, updatedAt: now,
    });
    else await ctx.db.insert("examReleases", {
      ownerId, courseId: course._id, draftId, activeSnapshotId: snapshotId, version,
      studentEntryEnabled: false, preparedForAudience: false, createdAt: now, updatedAt: now,
    });
    return { snapshotId, version };
  },
});

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

/**
 * Student entry is deliberately fail-closed until PR 14 installs explicit audience
 * assignment. Course approval alone is necessary, never sufficient for an exam.
 */
export const startAttempt = mutation({
  args: { snapshotId: v.id("examSnapshots") },
  returns: v.id("examAttempts"),
  handler: async (ctx, { snapshotId }) => {
    const studentId = await authenticated(ctx);
    const snapshot = await ctx.db.get("examSnapshots", snapshotId);
    if (!snapshot) throw new Error("NOT_FOUND: Exam not found.");
    const release = await ctx.db.query("examReleases")
      .withIndex("by_draft", q => q.eq("draftId", snapshot.draftId)).unique();
    if (!release || release.ownerId !== snapshot.ownerId ||
      release.activeSnapshotId !== snapshotId || !release.studentEntryEnabled)
      throw new Error("EXAM_NOT_ASSIGNED: This exam is not open for student attempts.");
    const course = await ctx.db.get("learnCollections", snapshot.courseId);
    if (!course || course.ownerId !== snapshot.ownerId || course.archived ||
      !course.publishedVersionId || course.communityState === "removed" ||
      course.communityState === "hidden" || !(await hasApprovedCourseAccess(ctx, snapshot.courseId, studentId)) ||
      course.ownerId === studentId)
      throw new Error("NOT_FOUND: Course exam not available.");
    // PR 14 must check all/selected/group audience before removing this final guard.
    throw new Error("EXAM_NOT_ASSIGNED: Audience policies have not been installed.");
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
      closedAt: attempt.closedAt,
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
