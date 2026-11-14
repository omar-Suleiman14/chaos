import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser, creatorRestricted } from "./authz";
import { validJob } from "./examGradingJobs";
import { calculateEssayAward, validateMarkFeedback } from "./examEssayGradingModel";
import { resultStatus } from "./examResultModel";

type Ctx = QueryCtx | MutationCtx;
const criterion = v.object({ criterionId: v.string(), scorePercent: v.number() });
const reviewDecision = v.union(v.literal("accept"), v.literal("override"), v.literal("reject"));
const appealDecision = v.union(v.literal("upheld"), v.literal("adjusted"), v.literal("rejected"));

async function actor(ctx: Ctx) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  return identity.subject;
}
async function doctor(ctx: Ctx) {
  const ownerId = await actor(ctx);
  if (await creatorRestricted(ctx, ownerId))
    throw new Error("NOT_FOUND: Submitted attempt not found.");
  return ownerId;
}
async function ownedAttempt(ctx: Ctx, attemptId: Id<"examAttempts">, ownerId: string) {
  const attempt = await ctx.db.get("examAttempts", attemptId);
  if (!attempt || attempt.ownerId !== ownerId || attempt.state !== "submitted")
    throw new Error("NOT_FOUND: Submitted attempt not found.");
  const snapshot = await ctx.db.get("examSnapshots", attempt.snapshotId);
  const [course, draft, grade] = await Promise.all([
    ctx.db.get("learnCollections", attempt.courseId),
    snapshot ? ctx.db.get("examBuilderDrafts", snapshot.draftId) : Promise.resolve(null),
    ctx.db.query("examGrades").withIndex("by_attempt", q => q.eq("attemptId", attemptId)).unique(),
  ]);
  if (!snapshot || !course || !draft || !grade ||
      snapshot.ownerId !== ownerId || snapshot.courseId !== course._id ||
      course.ownerId !== ownerId || course.communityState === "removed" ||
      draft.ownerId !== ownerId || draft.courseId !== course._id ||
      grade.ownerId !== ownerId || grade.snapshotId !== snapshot._id ||
      grade.studentId !== attempt.studentId)
    throw new Error("NOT_FOUND: Submitted attempt not found.");
  const release = await ctx.db.query("examReleases")
    .withIndex("by_draft", q => q.eq("draftId", draft._id)).unique();
  if (!release || release.ownerId !== ownerId || release.courseId !== course._id ||
      release.activeSnapshotId !== snapshot._id)
    throw new Error("NOT_FOUND: Submitted attempt not found.");
  return { attempt, snapshot, course, draft, grade };
}
function revision(value: number, current: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value !== current)
    throw new Error("REVISION_CONFLICT: Data changed; reload before acting.");
}
function note(value: string, min = 1) {
  if (value.trim().length < min || value.length > 2000)
    throw new Error("INVALID_REVIEW: A reason of the required length is needed.");
}
async function audit(ctx: MutationCtx, row: {
  attemptId: Id<"examAttempts">; snapshotId: Id<"examSnapshots">;
  ownerId: string; studentId: string;
}, actorId: string, action: string, detail: string, gradeRevision: number, questionIndex?: number) {
  await ctx.db.insert("examDoctorReviewAudit", {
    attemptId: row.attemptId, snapshotId: row.snapshotId,
    ownerId: row.ownerId, studentId: row.studentId, actorId,
    action, detail, gradeRevision, questionIndex, at: Date.now(),
  });
}

/** Privileged, owner-only view: proposed marks remain invisible to students. */
export const review = query({
  args: { jobId: v.id("examGradingJobs") },
  handler: async (ctx, { jobId }) => {
    const ownerId = await doctor(ctx);
    const { job, grade, snapshot } = await validJob(ctx, jobId);
    if (job.ownerId !== ownerId || job.status !== "doctor_review")
      throw new Error("NOT_FOUND: Review not found.");
    const proposals = await ctx.db.query("examGradingProposals")
      .withIndex("by_job_question", q => q.eq("jobId", jobId)).take(101);
    const pending = grade.entries.filter(e => e.status === "needs_manual");
    if (!pending.length || proposals.length !== pending.length ||
        new Set(proposals.map(p => p.questionIndex)).size !== proposals.length ||
        proposals.some(p => p.ownerId !== ownerId || p.snapshotId !== snapshot._id ||
          p.studentId !== job.studentId || p.attemptId !== job.attemptId ||
          !pending.some(e => e.questionIndex === p.questionIndex)))
      throw new Error("INTEGRITY_ERROR: Review proposal set is incomplete.");
    return {
      jobId, attemptId: job.attemptId, revision: job.revision,
      proposals: proposals.map(p => ({
        questionIndex: p.questionIndex, state: p.state, revision: p.revision,
        awardedCents: p.awardedCents, criterionScores: p.criterionScores,
        holisticAwardCents: p.holisticAwardCents ?? null, feedback: p.feedback,
        evidence: p.evidence, confidence: p.confidence,
        rubricCriteria: snapshot.questions[p.questionIndex].rubricCriteria ?? [],
        modelId: p.modelId ?? null, promptVersion: p.promptVersion ?? null,
      })),
    };
  },
});

/** A proposal is advice only. Only the owner can adopt, change, or reject it. */
export const decide = mutation({
  args: { jobId: v.id("examGradingJobs"), questionIndex: v.number(),
    expectedJobRevision: v.number(), expectedMarkRevision: v.number(),
    decision: reviewDecision, note: v.string(),
    criterionScores: v.optional(v.array(criterion)),
    holisticAwardCents: v.optional(v.number()), feedback: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ownerId = await doctor(ctx);
    const { job, grade, snapshot } = await validJob(ctx, args.jobId);
    if (job.ownerId !== ownerId || job.status !== "doctor_review")
      throw new Error("NOT_FOUND: Review not found.");
    revision(args.expectedJobRevision, job.revision);
    if (grade.state !== "needs_manual")
      throw new Error("GRADING_CONFLICT: Attempt is finalized.");
    if (!Number.isSafeInteger(args.questionIndex) || args.questionIndex < 0 ||
        snapshot.questions[args.questionIndex]?.kind !== "written" ||
        grade.entries[args.questionIndex]?.status !== "needs_manual")
      throw new Error("NOT_FOUND: Written question not found.");
    const proposal = await ctx.db.query("examGradingProposals")
      .withIndex("by_job_question", q => q.eq("jobId", job._id)
        .eq("questionIndex", args.questionIndex)).unique();
    if (!proposal || proposal.state !== "sent" ||
        proposal.ownerId !== ownerId || proposal.studentId !== job.studentId ||
        proposal.snapshotId !== snapshot._id || proposal.attemptId !== job.attemptId)
      throw new Error("GRADING_CONFLICT: Proposal already reviewed or mismatched.");
    const old = await ctx.db.query("examEssayMarks")
      .withIndex("by_attempt_question", q => q.eq("attemptId", job.attemptId)
        .eq("questionIndex", args.questionIndex)).unique();
    if (old && (old.ownerId !== ownerId || old.studentId !== job.studentId ||
        old.snapshotId !== snapshot._id || old.status === "approved" ||
        old.status === "submitted"))
      throw new Error("GRADING_CONFLICT: Existing mark requires separate moderation.");
    revision(args.expectedMarkRevision, old?.revision ?? 0);
    if (args.decision !== "accept") note(args.note);
    else if (args.note.length > 2000) note(args.note);
    if (args.decision !== "reject") {
      const scores = args.decision === "accept" ? proposal.criterionScores : args.criterionScores;
      const holistic = args.decision === "accept" ? proposal.holisticAwardCents : args.holisticAwardCents;
      const feedback = args.decision === "accept" ? proposal.feedback : args.feedback;
      if (!scores || feedback === undefined) throw new Error("INVALID_REVIEW: Missing doctor score.");
      validateMarkFeedback(feedback);
      const award = calculateEssayAward(snapshot.questions[args.questionIndex], scores, holistic);
      if (args.decision === "accept" && award !== proposal.awardedCents)
        throw new Error("INTEGRITY_ERROR: Proposal score has changed.");
      const mark = {
        attemptId: job.attemptId, snapshotId: snapshot._id,
        ownerId, studentId: job.studentId, questionIndex: args.questionIndex,
        criterionScores: scores, holisticAwardCents: holistic,
        awardedCents: award, feedback,
        status: "approved" as const, moderationNote: args.note,
        revision: (old?.revision ?? 0) + 1, updatedAt: Date.now(),
      };
      if (old) await ctx.db.patch("examEssayMarks", old._id, mark);
      else await ctx.db.insert("examEssayMarks", mark);
    }
    const state = args.decision === "accept" ? "accepted" :
      args.decision === "override" ? "overridden" : "rejected";
    await ctx.db.patch("examGradingProposals", proposal._id, { state });
    await ctx.db.patch("examGradingJobs", job._id, {
      revision: job.revision + 1, updatedAt: Date.now(),
    });
    await audit(ctx, job, ownerId, "proposal_" + state, args.note || state, grade.revision ?? 0, args.questionIndex);
    return { state, jobRevision: job.revision + 1, markRevision:
      args.decision === "reject" ? (old?.revision ?? 0) : (old?.revision ?? 0) + 1 };
  },
});

/** Students may contest only a currently released final result. One durable appeal per attempt. */
export const fileAppeal = mutation({
  args: { attemptId: v.id("examAttempts"), reason: v.string() },
  handler: async (ctx, { attemptId, reason }) => {
    const studentId = await actor(ctx);
    note(reason, 20);
    const attempt = await ctx.db.get("examAttempts", attemptId);
    if (!attempt || attempt.studentId !== studentId || attempt.state !== "submitted")
      throw new Error("NOT_FOUND: Result not found.");
    const { grade, snapshot, course } = await ownedAttempt(ctx, attemptId, attempt.ownerId);
    const pub = await ctx.db.query("examResultPublications")
      .withIndex("by_snapshot", q => q.eq("snapshotId", snapshot._id)).unique();
    if (pub && (pub.ownerId !== attempt.ownerId || pub.courseId !== course._id))
      throw new Error("INTEGRITY_ERROR: Publication mismatch.");
    const manualReleased = pub?.released === true && (
      (pub.releasedAt ?? -1) >= (grade.finalizedAt ?? 0) ||
      (grade.regradeReleasedAt ?? -1) >= (grade.finalizedAt ?? 0));
    if (resultStatus(grade, grade.resultPolicy, manualReleased, Date.now()) !== "released")
      throw new Error("GRADING_CONFLICT: An unreleased result cannot be appealed.");
    const existing = await ctx.db.query("examGradeAppeals")
      .withIndex("by_attempt", q => q.eq("attemptId", attemptId)).unique();
    if (existing) throw new Error("GRADING_CONFLICT: An appeal already exists.");
    const now = Date.now();
    const appealId = await ctx.db.insert("examGradeAppeals", {
      attemptId, snapshotId: snapshot._id, courseId: course._id,
      ownerId: attempt.ownerId, studentId, reason,
      status: "pending", originalGradeRevision: grade.revision ?? 0,
      revision: 0, requestedAt: now, updatedAt: now,
    });
    await audit(ctx, { attemptId, snapshotId: snapshot._id, ownerId: attempt.ownerId, studentId },
      studentId, "appeal_submitted", "Student requested grade review.", grade.revision ?? 0);
    return { appealId, status: "pending" as const, revision: 0 };
  },
});

export const myAppeal = query({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    const studentId = await actor(ctx);
    const attempt = await ctx.db.get("examAttempts", attemptId);
    if (!attempt || attempt.studentId !== studentId) throw new Error("NOT_FOUND: Appeal not found.");
    const row = await ctx.db.query("examGradeAppeals")
      .withIndex("by_attempt", q => q.eq("attemptId", attemptId)).unique();
    if (!row) return null;
    if (row.studentId !== studentId || row.snapshotId !== attempt.snapshotId ||
        row.ownerId !== attempt.ownerId)
      throw new Error("INTEGRITY_ERROR: Appeal ownership mismatch.");
    return { appealId: row._id, status: row.status, revision: row.revision,
      reason: row.reason, decisionNote: row.decisionNote ?? null, reviewedAt: row.reviewedAt ?? null };
  },
});

export const appealsForDraft = query({
  args: { draftId: v.id("examBuilderDrafts") },
  handler: async (ctx, { draftId }) => {
    const ownerId = await doctor(ctx);
    const draft = await ctx.db.get("examBuilderDrafts", draftId);
    if (!draft || draft.ownerId !== ownerId) throw new Error("NOT_FOUND: Exam not found.");
    const course = await ctx.db.get("learnCollections", draft.courseId);
    if (!course || course.ownerId !== ownerId || course.communityState === "removed")
      throw new Error("NOT_FOUND: Exam not found.");
    const rows = await ctx.db.query("examGradeAppeals")
      .withIndex("by_owner_course", q => q.eq("ownerId", ownerId).eq("courseId", course._id)).take(101);
    return { entries: rows.slice(0, 100).map(r => ({
      appealId: r._id, attemptId: r.attemptId, studentId: r.studentId,
      status: r.status, revision: r.revision, reason: r.reason, requestedAt: r.requestedAt,
      decisionNote: r.decisionNote ?? null,
    })), hasMore: rows.length > 100 };
  },
});

/** Review outcome is independent of releasing the revised grade. */
export const decideAppeal = mutation({
  args: { appealId: v.id("examGradeAppeals"), expectedRevision: v.number(),
    decision: appealDecision, note: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await doctor(ctx);
    note(args.note);
    const row = await ctx.db.get("examGradeAppeals", args.appealId);
    if (!row || row.ownerId !== ownerId || row.status !== "pending")
      throw new Error("NOT_FOUND: Pending appeal not found.");
    const { attempt, snapshot, grade, course } = await ownedAttempt(ctx, row.attemptId, ownerId);
    if (row.snapshotId !== snapshot._id || row.studentId !== attempt.studentId ||
        row.courseId !== course._id)
      throw new Error("INTEGRITY_ERROR: Appeal scope mismatch.");
    revision(args.expectedRevision, row.revision);
    if (args.decision === "adjusted" &&
        (grade.revision ?? 0) <= row.originalGradeRevision)
      throw new Error("GRADING_CONFLICT: Regrade before confirming an adjusted appeal.");
    if (args.decision !== "adjusted" &&
        (grade.revision ?? 0) !== row.originalGradeRevision)
      throw new Error("GRADING_CONFLICT: Grade changed; resolve as adjusted.");
    await ctx.db.patch("examGradeAppeals", row._id, {
      status: args.decision, decisionNote: args.note, reviewedAt: Date.now(),
      updatedAt: Date.now(), revision: row.revision + 1,
    });
    await audit(ctx, row, ownerId, "appeal_" + args.decision, args.note, grade.revision ?? 0);
    return { status: args.decision, revision: row.revision + 1 };
  },
});

/** Recalculate a finalized written mark under an attempt-scoped result hold. */
export const regrade = mutation({
  args: { attemptId: v.id("examAttempts"), questionIndex: v.number(),
    expectedGradeRevision: v.number(), expectedMarkRevision: v.number(),
    criterionScores: v.array(criterion), holisticAwardCents: v.optional(v.number()),
    feedback: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await doctor(ctx);
    note(args.reason, 10);
    validateMarkFeedback(args.feedback);
    const { attempt, snapshot, grade } = await ownedAttempt(ctx, args.attemptId, ownerId);
    if (grade.state !== "auto_final" || grade.pendingWrittenCount !== 0 ||
        grade.reviewHold === true)
      throw new Error("GRADING_CONFLICT: Grade cannot be regraded in its current state.");
    revision(args.expectedGradeRevision, grade.revision ?? 0);
    if (!Number.isSafeInteger(args.questionIndex) || args.questionIndex < 0 ||
        snapshot.questions[args.questionIndex]?.kind !== "written" ||
        grade.entries[args.questionIndex]?.status !== "scored")
      throw new Error("NOT_FOUND: Final written mark not found.");
    const old = await ctx.db.query("examEssayMarks")
      .withIndex("by_attempt_question", q => q.eq("attemptId", attempt._id)
        .eq("questionIndex", args.questionIndex)).unique();
    if (!old || old.status !== "approved" || old.ownerId !== ownerId ||
        old.studentId !== attempt.studentId || old.snapshotId !== snapshot._id)
      throw new Error("GRADING_CONFLICT: Missing verified approved mark.");
    revision(args.expectedMarkRevision, old.revision);
    const entry = grade.entries[args.questionIndex];
    if (entry.pointsAwardedCents !== old.awardedCents)
      throw new Error("INTEGRITY_ERROR: Ledger differs from approved mark.");
    const award = calculateEssayAward(snapshot.questions[args.questionIndex],
      args.criterionScores, args.holisticAwardCents);
    if (award === old.awardedCents)
      throw new Error("GRADING_CONFLICT: New score is unchanged.");
    const earnedCents = grade.earnedCents - old.awardedCents + award;
    if (!Number.isSafeInteger(earnedCents) || earnedCents < 0 ||
        earnedCents > grade.maximumCents)
      throw new Error("INTEGRITY_ERROR: Regrade would produce an invalid total.");
    const now = Date.now();
    await ctx.db.patch("examEssayMarks", old._id, {
      criterionScores: args.criterionScores, holisticAwardCents: args.holisticAwardCents,
      awardedCents: award, feedback: args.feedback,
      moderationNote: args.reason, revision: old.revision + 1, updatedAt: now,
    });
    await ctx.db.patch("examGrades", grade._id, {
      earnedCents, finalPercentBasisPoints: Math.round(earnedCents * 10_000 / grade.maximumCents),
      entries: grade.entries.map(e => e.questionIndex === args.questionIndex
        ? { ...e, pointsAwardedCents: award } : e),
      reviewHold: true, regradeReleasedAt: undefined, finalizedAt: now,
      gradedAt: now, revision: (grade.revision ?? 0) + 1,
    });
    await audit(ctx, { attemptId: attempt._id, snapshotId: snapshot._id, ownerId,
      studentId: attempt.studentId }, ownerId, "regrade", args.reason,
      (grade.revision ?? 0) + 1, args.questionIndex);
    return { earnedCents, revision: (grade.revision ?? 0) + 1, held: true };
  },
});

/** Regrade never republishes itself. Doctor explicitly lifts the per-attempt hold. */
export const releaseRegrade = mutation({
  args: { attemptId: v.id("examAttempts"), expectedGradeRevision: v.number(),
    confirmRelease: v.boolean() },
  handler: async (ctx, args) => {
    const ownerId = await doctor(ctx);
    const { attempt, snapshot, grade } = await ownedAttempt(ctx, args.attemptId, ownerId);
    revision(args.expectedGradeRevision, grade.revision ?? 0);
    if (!args.confirmRelease || grade.state !== "auto_final" ||
        grade.reviewHold !== true || grade.finalPercentBasisPoints === undefined)
      throw new Error("GRADING_CONFLICT: No reviewed revision ready for release.");
    const appeal = await ctx.db.query("examGradeAppeals")
      .withIndex("by_attempt", q => q.eq("attemptId", attempt._id)).unique();
    if (appeal && (appeal.ownerId !== ownerId || appeal.studentId !== attempt.studentId ||
      appeal.status === "pending"))
      throw new Error("GRADING_CONFLICT: Resolve the pending appeal before release.");
    const now = Date.now();
    await ctx.db.patch("examGrades", grade._id, {
      reviewHold: false, regradeReleasedAt: now, revision: (grade.revision ?? 0) + 1,
    });
    await audit(ctx, { attemptId: attempt._id, snapshotId: snapshot._id, ownerId,
      studentId: attempt.studentId }, ownerId, "regrade_released",
      "Doctor confirmed revised result release.", (grade.revision ?? 0) + 1);
    return { revision: (grade.revision ?? 0) + 1, releasedFromHold: true };
  },
});
