import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdminForActor } from "./adminAccess";
import { auditJob, validJob } from "./examGradingJobs";
import { calculateEssayAward, validateMarkFeedback } from "./examEssayGradingModel";

const evidenceValidator = v.object({
  criterionId: v.string(), quote: v.string(), rationale: v.string(),
});
const criterionValidator = v.object({ criterionId: v.string(), scorePercent: v.number() });
const MAX_ANSWER_CHARS = 10_000;

async function authorizedClaim(ctx: MutationCtx, jobId: Id<"examGradingJobs">, userId: string) {
  await requireAdminForActor(ctx, userId);
  const { job, grade, snapshot } = await validJob(ctx, jobId);
  if (job.status !== "claimed" || job.claimAdminId !== userId ||
      !job.claimExpiresAt || job.claimExpiresAt <= Date.now())
    throw new Error("GRADING_CONFLICT: Claim expired or owned by another administrator.");
  return { job, grade, snapshot };
}

function pending(grade: Doc<"examGrades">, snapshot: Doc<"examSnapshots">, questionIndex: number) {
  if (!Number.isSafeInteger(questionIndex) || questionIndex < 0 ||
      questionIndex >= snapshot.questions.length ||
      snapshot.questions[questionIndex].kind !== "written" ||
      grade.entries[questionIndex]?.status !== "needs_manual")
    throw new Error("NOT_FOUND: Pending essay not found.");
  return snapshot.questions[questionIndex];
}

async function response(ctx: MutationCtx, job: Doc<"examGradingJobs">, questionIndex: number) {
  const row = await ctx.db.query("examAttemptAnswers").withIndex("by_attempt_question",
    q => q.eq("attemptId", job.attemptId).eq("questionIndex", questionIndex)).unique();
  if (!row || row.studentId !== job.studentId || row.snapshotId !== job.snapshotId ||
      !row.text.trim() || row.text.length > MAX_ANSWER_CHARS)
    throw new Error("INTEGRITY_ERROR: Complete verified written answer required.");
  return row.text;
}

/** Every private bundle read is recorded; no browse without an unexpired exclusive claim. */
export const bundle = internalMutation({
  args: { jobId: v.id("examGradingJobs"), userId: v.string() },
  handler: async (ctx, { jobId, userId }) => {
    const { job, snapshot, grade } = await authorizedClaim(ctx, jobId, userId);
    const pendingEntries = grade.entries.filter(e => e.status === "needs_manual");
    if (!pendingEntries.length || pendingEntries.length > 100)
      throw new Error("GRADING_CONFLICT: Unexpected written-answer count.");
    const questions = await Promise.all(pendingEntries.map(async e => {
      const question = pending(grade, snapshot, e.questionIndex);
      const answerText = await response(ctx, job, e.questionIndex);
      const proposal = await ctx.db.query("examGradingProposals")
        .withIndex("by_job_question", q => q.eq("jobId", jobId)
          .eq("questionIndex", e.questionIndex)).unique();
      if (proposal && (proposal.ownerId !== job.ownerId || proposal.studentId !== job.studentId ||
          proposal.snapshotId !== snapshot._id || proposal.adminId !== userId))
        throw new Error("INTEGRITY_ERROR: Proposal ownership mismatch.");
      return {
        questionIndex: e.questionIndex, prompt: question.prompt,
        response: answerText, pointsAvailableCents: e.pointsAvailableCents,
        rubricCriteria: question.rubricCriteria ?? [],
        sampleAnswer: question.sampleAnswer ?? null,
        proposal: proposal ? {
          revision: proposal.revision, criterionScores: proposal.criterionScores,
          holisticAwardCents: proposal.holisticAwardCents ?? null,
          awardedCents: proposal.awardedCents, feedback: proposal.feedback,
          evidence: proposal.evidence, confidence: proposal.confidence,
          modelId: proposal.modelId ?? null, promptVersion: proposal.promptVersion ?? null,
        } : null,
      };
    }));
    await auditJob(ctx, job, userId, "bundle_read", "Admin opened a claimed, consented written-answer bundle.");
    return { jobId, attemptId: job.attemptId, revision: job.revision,
      claimExpiresAt: job.claimExpiresAt!, questions };
  },
});

/** Proposed marks are isolated from examGrades and essay approvals. */
export const save = internalMutation({
  args: { userId: v.string(), jobId: v.id("examGradingJobs"), questionIndex: v.number(),
    expectedRevision: v.number(), criterionScores: v.array(criterionValidator),
    holisticAwardCents: v.optional(v.number()), feedback: v.string(),
    evidence: v.array(evidenceValidator), confidence: v.union(
      v.literal("low"), v.literal("medium"), v.literal("high")),
    modelId: v.optional(v.string()), promptVersion: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { job, grade, snapshot } = await authorizedClaim(ctx, args.jobId, args.userId);
    const question = pending(grade, snapshot, args.questionIndex);
    const answer = await response(ctx, job, args.questionIndex);
    validateMarkFeedback(args.feedback);
    const awardedCents = calculateEssayAward(question, args.criterionScores, args.holisticAwardCents);
    if ((args.modelId?.length ?? 0) > 120 || (args.promptVersion?.length ?? 0) > 80)
      throw new Error("INVALID_PROPOSAL: Invalid provenance.");
    const ids = question.rubricCriteria?.length
      ? question.rubricCriteria.map(c => c.id) : ["holistic"];
    if (args.evidence.length !== ids.length ||
        new Set(args.evidence.map(e => e.criterionId)).size !== ids.length ||
        args.evidence.some(e => !ids.includes(e.criterionId) ||
          e.quote.trim().length < 4 || e.quote.length > 300 ||
          !answer.includes(e.quote) ||
          e.rationale.trim().length < 10 || e.rationale.length > 1000))
      throw new Error("INVALID_PROPOSAL: Quote exact answer evidence for every rubric criterion.");
    const old = await ctx.db.query("examGradingProposals").withIndex("by_job_question",
      q => q.eq("jobId", args.jobId).eq("questionIndex", args.questionIndex)).unique();
    if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0 ||
        (old?.revision ?? 0) !== args.expectedRevision)
      throw new Error("REVISION_CONFLICT: Proposal changed; reload.");
    if (old && (old.state !== "draft" || old.adminId !== args.userId ||
        old.ownerId !== job.ownerId || old.studentId !== job.studentId ||
        old.snapshotId !== snapshot._id || old.revision >= 20))
      throw new Error("GRADING_CONFLICT: Proposal is no longer editable.");
    const payload = {
      jobId: job._id, attemptId: job.attemptId, snapshotId: snapshot._id,
      ownerId: job.ownerId, studentId: job.studentId,
      questionIndex: args.questionIndex, adminId: args.userId,
      criterionScores: args.criterionScores, holisticAwardCents: args.holisticAwardCents,
      awardedCents, feedback: args.feedback, evidence: args.evidence,
      confidence: args.confidence, modelId: args.modelId,
      promptVersion: args.promptVersion, state: "draft" as const,
      revision: args.expectedRevision + 1, updatedAt: Date.now(),
    };
    const proposalId = old ? old._id : await ctx.db.insert("examGradingProposals", payload);
    if (old) await ctx.db.patch("examGradingProposals", old._id, payload);
    await auditJob(ctx, job, args.userId, "proposal_saved",
      "Admin saved a private rubric-grounded candidate proposal for question " + args.questionIndex + ".");
    return { proposalId, revision: args.expectedRevision + 1, awardedCents };
  },
});

export const submit = internalMutation({
  args: { userId: v.string(), jobId: v.id("examGradingJobs"), expectedRevision: v.number() },
  handler: async (ctx, { userId, jobId, expectedRevision }) => {
    const { job, grade, snapshot } = await authorizedClaim(ctx, jobId, userId);
    if (!Number.isSafeInteger(expectedRevision) || job.revision !== expectedRevision)
      throw new Error("REVISION_CONFLICT: Job changed; reload.");
    const pendingEntries = grade.entries.filter(e => e.status === "needs_manual");
    const proposals = await ctx.db.query("examGradingProposals")
      .withIndex("by_job_question", q => q.eq("jobId", jobId)).take(101);
    if (pendingEntries.length < 1 || proposals.length !== pendingEntries.length ||
        proposals.some(p => p.adminId !== userId || p.ownerId !== job.ownerId ||
          p.studentId !== job.studentId || p.snapshotId !== snapshot._id ||
          p.state !== "draft" ||
          !pendingEntries.some(e => e.questionIndex === p.questionIndex)) ||
        new Set(proposals.map(p => p.questionIndex)).size !== proposals.length)
      throw new Error("GRADING_CONFLICT: Every pending essay needs one valid proposal.");
    for (const proposal of proposals)
      await ctx.db.patch("examGradingProposals", proposal._id, { state: "sent" });
    const now = Date.now();
    await ctx.db.patch("examGradingJobs", jobId, {
      status: "doctor_review", revision: job.revision + 1, updatedAt: now,
      claimExpiresAt: undefined, claimAdminId: undefined,
    });
    await auditJob(ctx, { ...job, revision: job.revision + 1 }, userId,
      "sent_to_doctor", "All proposals submitted for independent doctor review; no grade was finalized.");
    return { jobId, revision: job.revision + 1, status: "doctor_review" as const };
  },
});
