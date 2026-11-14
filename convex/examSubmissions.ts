import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation, mutation, query, type MutationCtx, type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser } from "./authz";
import { authorizedAttempt } from "./examAnswers";
import {
  countExamAnswers, examAnswerRevisionStamp, requireExamAttemptTiming,
  requireManualSubmissionAllowed,
} from "./examSubmissionModel";

type ReadCtx = QueryCtx | MutationCtx;
type Attempt = Doc<"examAttempts">;
const CONFIRMATION_TTL_MS = 120_000;
const MAX_ANSWERS = 100;

/** An opaque attempt ID is never authorization; always check the authenticated subject. */
async function requireMyAttempt(ctx: ReadCtx, attemptId: Id<"examAttempts">) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  const attempt = await ctx.db.get("examAttempts", attemptId);
  if (!attempt || attempt.studentId !== identity.subject)
    throw new Error("NOT_FOUND: Attempt not found.");
  const snapshot = await ctx.db.get("examSnapshots", attempt.snapshotId);
  if (!snapshot || snapshot.ownerId !== attempt.ownerId ||
      snapshot.courseId !== attempt.courseId)
    throw new Error("NOT_FOUND: Attempt not found.");
  return { attempt, snapshot };
}

async function answersFor(ctx: ReadCtx, attemptId: Id<"examAttempts">) {
  return ctx.db.query("examAttemptAnswers")
    .withIndex("by_attempt_question", q => q.eq("attemptId", attemptId))
    .take(MAX_ANSWERS);
}

async function getStoredReceipt(ctx: ReadCtx, attemptId: Id<"examAttempts">) {
  return ctx.db.query("examSubmissionReceipts")
    .withIndex("by_attempt", q => q.eq("attemptId", attemptId)).unique();
}

function toReceipt(row: Doc<"examSubmissionReceipts">) {
  return {
    receiptId: row._id, attemptId: row.attemptId, snapshotId: row.snapshotId,
    outcome: row.outcome, reason: row.reason, completedAt: row.completedAt,
    answeredCount: row.answeredCount, questionCount: row.questionCount,
    startedAt: row.startedAt, deadlineAt: row.deadlineAt,
  };
}

/** One Convex transaction owns terminal state and durable, answer-free receipt. */
async function finalize(
  ctx: MutationCtx, attempt: Attempt, reason: "student" | "timeout",
  now: number, submissionId?: string,
) {
  const prior = await getStoredReceipt(ctx, attempt._id);
  if (attempt.state !== "in_progress") {
    if (!prior) throw new Error("ATTEMPT_FINALIZED: No receipt for this legacy attempt.");
    return toReceipt(prior);
  }
  if (prior) throw new Error("INTEGRITY_ERROR: Receipt exists for an active attempt.");
  const clock = requireExamAttemptTiming(attempt);
  if (reason === "timeout" && now < clock.deadlineAt)
    throw new Error("ATTEMPT_NOT_DUE: Deadline has not passed.");
  if (reason === "student" && now >= clock.deadlineAt)
    throw new Error("ATTEMPT_TIMED_OUT: Deadline has passed.");
  const snapshot = await ctx.db.get("examSnapshots", attempt.snapshotId);
  if (!snapshot || snapshot.ownerId !== attempt.ownerId ||
      snapshot.courseId !== attempt.courseId)
    throw new Error("NOT_FOUND: Attempt not found.");
  const answers = await answersFor(ctx, attempt._id);
  const outcome = reason === "student" ||
    clock.submissionPolicy.timeoutAction === "auto_submit" ? "submitted" : "expired";
  await ctx.db.patch("examAttempts", attempt._id, {
    state: outcome, revision: attempt.revision + 1, updatedAt: now,
    closedAt: now, ...(outcome === "submitted" ? { submittedAt: now } : {}),
    ...(submissionId ? { submissionId } : {}),
    submitConfirmation: undefined,
  });
  const receiptId = await ctx.db.insert("examSubmissionReceipts", {
    attemptId: attempt._id, snapshotId: attempt.snapshotId,
    studentId: attempt.studentId, outcome, reason,
    completedAt: now, answeredCount: countExamAnswers(answers),
    questionCount: snapshot.questions.length,
    startedAt: attempt.startedAt, deadlineAt: clock.deadlineAt,
  });
  const receipt = await ctx.db.get("examSubmissionReceipts", receiptId);
  if (!receipt) throw new Error("INTEGRITY_ERROR: Receipt was not stored.");
  return toReceipt(receipt);
}

/**
 * Candidate-facing clock metadata: UI countdowns are advisory; all writes use
 * Date.now() in Convex. No questions, answers or marking keys leave this query.
 */
export const getStatus = query({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    const { attempt, snapshot } = await requireMyAttempt(ctx, attemptId);
    const { deadlineAt, minimumSubmitAt, submissionPolicy } = requireExamAttemptTiming(attempt);
    const serverNow = Date.now();
    if (attempt.state === "in_progress" && serverNow < deadlineAt)
      await authorizedAttempt(ctx, attemptId);
    const answers = await answersFor(ctx, attemptId);
    const answeredCount = countExamAnswers(answers);
    const elapsed = attempt.state === "in_progress" && serverNow >= deadlineAt;
    const canPrepare = attempt.state === "in_progress" && !elapsed &&
      submissionPolicy.allowEarlySubmission && serverNow >= minimumSubmitAt &&
      (!submissionPolicy.requireAllAnswers || answeredCount === snapshot.questions.length);
    return {
      attemptId, state: attempt.state, timedOut: elapsed,
      serverNow, startedAt: attempt.startedAt, deadlineAt, minimumSubmitAt,
      canPrepare, answeredCount, questionCount: snapshot.questions.length,
      requireAllAnswers: submissionPolicy.requireAllAnswers,
      allowEarlySubmission: submissionPolicy.allowEarlySubmission,
      timeoutAction: submissionPolicy.timeoutAction,
      receiptAvailable: attempt.state !== "in_progress" &&
        !!(await getStoredReceipt(ctx, attemptId)),
    };
  },
});

/** First explicit step of double confirmation. A subsequent save invalidates this preview. */
export const prepareSubmission = mutation({
  args: { attemptId: v.id("examAttempts"), expectedRevision: v.number() },
  handler: async (ctx, { attemptId, expectedRevision }) => {
    const { attempt, snapshot } = await authorizedAttempt(ctx, attemptId);
    if (!Number.isSafeInteger(expectedRevision) || attempt.revision !== expectedRevision)
      throw new Error("REVISION_CONFLICT: Attempt changed; reload before submitting.");
    const now = Date.now();
    const answers = await answersFor(ctx, attemptId);
    const answeredCount = countExamAnswers(answers);
    requireManualSubmissionAllowed(attempt, now, answeredCount, snapshot.questions.length);
    const { deadlineAt } = requireExamAttemptTiming(attempt);
    const confirmationId = crypto.randomUUID();
    const expiresAt = Math.min(now + CONFIRMATION_TTL_MS, deadlineAt);
    await ctx.db.patch("examAttempts", attemptId, {
      submitConfirmation: {
        id: confirmationId, expiresAt, answerStamp: examAnswerRevisionStamp(answers),
        expectedRevision,
      },
      updatedAt: now,
    });
    return {
      confirmationId, expiresAt, expectedRevision, serverNow: now,
      answeredCount, unansweredCount: snapshot.questions.length - answeredCount,
      questionCount: snapshot.questions.length,
    };
  },
});

/** Second explicit step. Replayed confirmations return the exact stored receipt. */
export const submit = mutation({
  args: {
    attemptId: v.id("examAttempts"), confirmationId: v.string(),
    expectedRevision: v.number(), confirmed: v.literal(true),
  },
  handler: async (ctx, args) => {
    const { attempt } = await requireMyAttempt(ctx, args.attemptId);
    if (attempt.state === "submitted" &&
        attempt.submissionId === args.confirmationId) {
      const receipt = await getStoredReceipt(ctx, attempt._id);
      if (!receipt) throw new Error("INTEGRITY_ERROR: Submission receipt missing.");
      return toReceipt(receipt);
    }
    if (attempt.state !== "in_progress")
      throw new Error("ATTEMPT_FINALIZED: Attempt already closed.");
    const now = Date.now();
    const clock = requireExamAttemptTiming(attempt);
    if (now >= clock.deadlineAt) return finalize(ctx, attempt, "timeout", now);
    const { snapshot } = await authorizedAttempt(ctx, args.attemptId);
    if (!Number.isSafeInteger(args.expectedRevision) ||
        attempt.revision !== args.expectedRevision ||
        !attempt.submitConfirmation ||
        attempt.submitConfirmation.id !== args.confirmationId ||
        attempt.submitConfirmation.expectedRevision !== args.expectedRevision ||
        now >= attempt.submitConfirmation.expiresAt)
      throw new Error("CONFIRMATION_STALE: Prepare submission again.");
    const answers = await answersFor(ctx, args.attemptId);
    const answeredCount = countExamAnswers(answers);
    requireManualSubmissionAllowed(attempt, now, answeredCount, snapshot.questions.length);
    if (examAnswerRevisionStamp(answers) !== attempt.submitConfirmation.answerStamp)
      throw new Error("ANSWERS_CHANGED: Review updated answers and confirm again.");
    return finalize(ctx, attempt, "student", now, args.confirmationId);
  },
});

/** Only the candidate can request eager timeout reconciliation; no early closes. */
export const expireDue = mutation({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    const { attempt } = await requireMyAttempt(ctx, attemptId);
    if (attempt.state !== "in_progress") {
      const receipt = await getStoredReceipt(ctx, attemptId);
      if (!receipt) throw new Error("ATTEMPT_FINALIZED: Receipt unavailable.");
      return toReceipt(receipt);
    }
    return finalize(ctx, attempt, "timeout", Date.now());
  },
});

/** Persistent proof remains candidate-private, including after eligibility changes. */
export const getReceipt = query({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    const { attempt } = await requireMyAttempt(ctx, attemptId);
    if (attempt.state === "in_progress") return null;
    const receipt = await getStoredReceipt(ctx, attemptId);
    return receipt ? toReceipt(receipt) : null;
  },
});

/**
 * Future secure start transaction MUST schedule this deadline after inserting
 * a timed attempt. A scheduler retry is harmless; close is state-idempotent.
 */
export const armDeadlineInternal = internalMutation({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    const attempt = await ctx.db.get("examAttempts", attemptId);
    if (!attempt || attempt.state !== "in_progress")
      throw new Error("NOT_FOUND: Active timed attempt required.");
    const { deadlineAt } = requireExamAttemptTiming(attempt);
    await ctx.scheduler.runAt(Math.max(deadlineAt, Date.now()),
      internal.examSubmissions.finalizeAtDeadline, { attemptId, deadlineAt });
    return { deadlineAt };
  },
});

/** Scheduled backend closure, independent of browser connectivity or sleep. */
export const finalizeAtDeadline = internalMutation({
  args: { attemptId: v.id("examAttempts"), deadlineAt: v.number() },
  handler: async (ctx, { attemptId, deadlineAt }) => {
    const attempt = await ctx.db.get("examAttempts", attemptId);
    if (!attempt || attempt.state !== "in_progress") return null;
    const clock = requireExamAttemptTiming(attempt);
    // A teacher may extend a live deadline. The previous scheduled job is stale,
    // while the extension transaction has already scheduled its replacement.
    if (clock.deadlineAt !== deadlineAt) return null;
    if (Date.now() < deadlineAt) return null;
    return finalize(ctx, attempt, "timeout", Date.now());
  },
});
