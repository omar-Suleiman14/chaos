import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireActiveUser } from "./authz";
import { requireEligiblePreflight } from "./examPreflight";
import { normalizeExamAnswer, sameExamAnswer } from "./examAnswerModel";

type Ctx = QueryCtx | MutationCtx;

/**
 * Private answer transport foundation. Public startAttempt remains hard-disabled:
 * this never creates an attempt, activates a release or exposes snapshot contents.
 */
async function authorizedAttempt(ctx: Ctx, attemptId: Id<"examAttempts">) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  const attempt = await ctx.db.get("examAttempts", attemptId);
  if (!attempt || attempt.studentId !== identity.subject)
    throw new Error("NOT_FOUND: Attempt not found.");
  if (attempt.state !== "in_progress")
    throw new Error("ATTEMPT_FINALIZED: Answers are no longer editable.");
  const snapshot = await ctx.db.get("examSnapshots", attempt.snapshotId);
  if (!snapshot || snapshot.ownerId !== attempt.ownerId ||
      snapshot.courseId !== attempt.courseId)
    throw new Error("NOT_FOUND: Attempt not found.");
  const release = await ctx.db.query("examReleases")
    .withIndex("by_draft", q => q.eq("draftId", snapshot.draftId)).unique();
  if (!release || !release.studentEntryEnabled ||
      release.activeSnapshotId !== snapshot._id ||
      release.courseId !== attempt.courseId || release.ownerId !== attempt.ownerId)
    throw new Error("EXAM_NOT_READY: Secure student entry is disabled.");
  const eligibility = await requireEligiblePreflight(ctx, release._id);
  if (eligibility.studentId !== attempt.studentId ||
      eligibility.snapshot._id !== snapshot._id ||
      (eligibility.settings.mode === "scheduled" &&
        eligibility.settings.opensAt! > eligibility.now))
    throw new Error("NOT_FOUND: Candidate is not eligible for this attempt.");
  const consent = await ctx.db.query("examConsents")
    .withIndex("by_release_student", q =>
      q.eq("releaseId", release._id).eq("studentId", attempt.studentId)).unique();
  if (!consent || consent.snapshotId !== snapshot._id ||
      consent.policyVersion !== eligibility.policyVersion)
    throw new Error("CONSENT_REQUIRED: Accept the current exam rules.");
  return { attempt, snapshot };
}

/** Never returns marking keys, question content, private image URLs or other candidates' answers. */
export const getMine = query({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    await authorizedAttempt(ctx, attemptId);
    const answers = await ctx.db.query("examAttemptAnswers")
      .withIndex("by_attempt", q => q.eq("attemptId", attemptId)).take(100);
    return answers.map(answer => ({
      questionIndex: answer.questionIndex, choiceIds: answer.choiceIds,
      text: answer.text, flagged: answer.flagged,
      savedForLater: answer.savedForLater, revision: answer.revision,
      savedAt: answer.savedAt,
    }));
  },
});

/**
 * Per-question compare-and-swap plus retry idempotency. A stale tab cannot
 * silently overwrite a newer answer. Clients show "Saved" only on this ACK.
 */
export const save = mutation({
  args: {
    attemptId: v.id("examAttempts"),
    questionIndex: v.number(),
    expectedRevision: v.number(),
    mutationId: v.string(),
    answer: v.object({
      choiceIds: v.array(v.string()),
      text: v.string(),
      flagged: v.boolean(),
      savedForLater: v.boolean(),
    }),
  },
  returns: v.object({ questionIndex: v.number(), revision: v.number(), savedAt: v.number() }),
  handler: async (ctx, args) => {
    const { attempt, snapshot } = await authorizedAttempt(ctx, args.attemptId);
    if (!Number.isSafeInteger(args.questionIndex) || args.questionIndex < 0 ||
        args.questionIndex >= snapshot.questions.length ||
        !Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0 ||
        !/^[A-Za-z0-9:_-]{8,128}$/.test(args.mutationId))
      throw new Error("INVALID_ANSWER: Invalid question, revision or retry identifier.");
    const question = snapshot.questions[args.questionIndex];
    const normalized = normalizeExamAnswer(
      question, args.answer.choiceIds, args.answer.text);
    const submitted = { ...normalized,
      flagged: args.answer.flagged, savedForLater: args.answer.savedForLater };
    const previous = await ctx.db.query("examAttemptAnswers")
      .withIndex("by_attempt_question", q => q.eq("attemptId", args.attemptId)
        .eq("questionIndex", args.questionIndex)).unique();
    if (previous?.lastMutationId === args.mutationId) {
      if (!sameExamAnswer(previous, submitted))
        throw new Error("IDEMPOTENCY_CONFLICT: Retry token was reused with different content.");
      return { questionIndex: args.questionIndex,
        revision: previous.revision, savedAt: previous.savedAt };
    }
    if ((previous?.revision ?? 0) !== args.expectedRevision)
      throw new Error("REVISION_CONFLICT: Another tab or device saved a newer answer. Reload and reconcile.");
    const revision = args.expectedRevision + 1;
    const savedAt = Date.now();
    const fields = {
      snapshotId: snapshot._id, studentId: attempt.studentId, questionIndex: args.questionIndex,
      ...submitted, revision, lastMutationId: args.mutationId, savedAt,
    };
    if (previous) await ctx.db.patch("examAttemptAnswers", previous._id, fields);
    else await ctx.db.insert("examAttemptAnswers", { attemptId: args.attemptId, ...fields });
    return { questionIndex: args.questionIndex, revision, savedAt };
  },
});
