import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser, creatorRestricted } from "./authz";
import { calculateEssayAward, finalEssayGrade, validateMarkFeedback } from "./examEssayGradingModel";

type Ctx = QueryCtx | MutationCtx;
const scoreValidator = v.object({ criterionId: v.string(), scorePercent: v.number() });
async function owner(ctx: Ctx) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  if (await creatorRestricted(ctx, identity.subject))
    throw new Error("NOT_FOUND: Exam not found.");
  return identity.subject;
}

/** Identity, course, version, active release, and stored grade must all agree. */
async function ownedAttempt(ctx: Ctx, attemptId: Id<"examAttempts">) {
  const actorId = await owner(ctx);
  const attempt = await ctx.db.get("examAttempts", attemptId);
  if (!attempt || attempt.ownerId !== actorId || attempt.state !== "submitted")
    throw new Error("NOT_FOUND: Submitted attempt not found.");
  const [snapshot, course, draft, grade] = await Promise.all([
    ctx.db.get("examSnapshots", attempt.snapshotId),
    ctx.db.get("learnCollections", attempt.courseId),
    ctx.db.get("examBuilderDrafts", snapshot.draftId),
    ctx.db.query("examGrades").withIndex("by_attempt",
      q => q.eq("attemptId", attemptId)).unique(),
  ]);
  if (!snapshot || !course || !grade ||
      snapshot.ownerId !== actorId || snapshot.courseId !== attempt.courseId ||
      course.ownerId !== actorId || course.communityState === "removed" ||
      (!draft || draft.ownerId !== actorId || draft.courseId !== attempt.courseId) ||
      grade.ownerId !== actorId || grade.studentId !== attempt.studentId ||
      grade.snapshotId !== attempt.snapshotId)
    throw new Error("NOT_FOUND: Submitted attempt not found.");
  const release = await ctx.db.query("examReleases")
    .withIndex("by_draft", q => q.eq("draftId", snapshot.draftId)).unique();
  if (!release || release.ownerId !== actorId ||
      release.activeSnapshotId !== snapshot._id ||
      release.courseId !== course._id)
    throw new Error("NOT_FOUND: Submitted attempt not found.");
  return { actorId, attempt, snapshot, grade };
}
async function markFor(ctx: Ctx, attemptId: Id<"examAttempts">, questionIndex: number) {
  return ctx.db.query("examEssayMarks").withIndex("by_attempt_question",
    q => q.eq("attemptId", attemptId).eq("questionIndex", questionIndex)).unique();
}
function pendingQuestion(snapshot: Doc<"examSnapshots">, grade: Doc<"examGrades">, index: number) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= snapshot.questions.length ||
      snapshot.questions[index].kind !== "written" ||
      grade.entries[index]?.questionIndex !== index ||
      grade.entries[index]?.status !== "needs_manual")
    throw new Error("NOT_FOUND: Pending written question not found.");
  return snapshot.questions[index];
}
function writable(grade: Doc<"examGrades">) {
  if (grade.state !== "needs_manual") throw new Error("GRADING_CONFLICT: Grade already finalized.");
}
async function audit(ctx: MutationCtx, mark: {
  attemptId: Id<"examAttempts">; snapshotId: Id<"examSnapshots">;
  ownerId: string; studentId: string; questionIndex: number;
}, action: "save" | "submit" | "approve" | "changes_requested" | "finalize",
 revision: number, detail: string) {
  await ctx.db.insert("examEssayMarkAudit", {
    ...mark, actorId: mark.ownerId, action, revision, detail,
    at: Date.now(),
  });
}

export const queue = query({
  args: { draftId: v.id("examBuilderDrafts") },
  handler: async (ctx, { draftId }) => {
    const actorId = await owner(ctx);
    const draft = await ctx.db.get("examBuilderDrafts", draftId);
    if (!draft || draft.ownerId !== actorId) throw new Error("NOT_FOUND: Exam not found.");
    const course = await ctx.db.get("learnCollections", draft.courseId);
    const release = await ctx.db.query("examReleases")
      .withIndex("by_draft", q => q.eq("draftId", draftId)).unique();
    if (!course || course.ownerId !== actorId || course.communityState === "removed" ||
        !release || release.ownerId !== actorId || release.courseId !== draft.courseId)
      throw new Error("NOT_FOUND: Exam not found.");
    const snapshot = await ctx.db.get("examSnapshots", release.activeSnapshotId);
    if (!snapshot || snapshot.ownerId !== actorId || snapshot.draftId !== draftId)
      throw new Error("NOT_FOUND: Exam not found.");
    const attempts = await ctx.db.query("examAttempts")
      .withIndex("by_snapshot_student", q => q.eq("snapshotId", snapshot._id)).take(101);
    const entries = await Promise.all(attempts.slice(0, 100).map(async attempt => {
      if (attempt.ownerId !== actorId || attempt.courseId !== draft.courseId)
        throw new Error("INTEGRITY_ERROR: Attempt belongs to a different course.");
      if (attempt.state !== "submitted") return null;
      const grade = await ctx.db.query("examGrades")
        .withIndex("by_attempt", q => q.eq("attemptId", attempt._id)).unique();
      if (!grade || grade.ownerId !== actorId || grade.studentId !== attempt.studentId ||
          grade.snapshotId !== snapshot._id)
        throw new Error("INTEGRITY_ERROR: Grade missing or mismatched.");
      const marks = await ctx.db.query("examEssayMarks")
        .withIndex("by_attempt_question", q => q.eq("attemptId", attempt._id)).take(101);
      if (marks.some(m => m.ownerId !== actorId || m.studentId !== attempt.studentId ||
          m.snapshotId !== snapshot._id)) throw new Error("INTEGRITY_ERROR: Mark ownership mismatch.");
      return { attemptId: attempt._id, studentId: attempt.studentId,
        gradingState: grade.state, pendingWrittenCount: grade.pendingWrittenCount,
        approvedCount: marks.filter(m => m.status === "approved").length,
        gradeRevision: grade.revision ?? 0,
        submittedCount: marks.filter(m => m.status === "submitted").length,
        draftCount: marks.filter(m => m.status === "draft" || m.status === "changes_requested").length,
        pendingQuestions: grade.entries.filter(e => e.status === "needs_manual").map(e => e.questionIndex) };
    }));
    return { title: snapshot.title, snapshotId: snapshot._id,
      entries: entries.filter(e => e !== null), hasMore: attempts.length > 100 };
  },
});

/** Only the owning teacher can read a student's essay and private frozen rubric. */
export const work = query({
  args: { attemptId: v.id("examAttempts"), questionIndex: v.number() },
  handler: async (ctx, { attemptId, questionIndex }) => {
    const { snapshot, grade } = await ownedAttempt(ctx, attemptId);
    const question = pendingQuestion(snapshot, grade, questionIndex);
    const answer = await ctx.db.query("examAttemptAnswers")
      .withIndex("by_attempt_question", q => q.eq("attemptId", attemptId)
        .eq("questionIndex", questionIndex)).unique();
    if (!answer || answer.studentId !== grade.studentId ||
        answer.snapshotId !== grade.snapshotId || !answer.text.trim())
      throw new Error("INTEGRITY_ERROR: Pending essay response missing.");
    const mark = await markFor(ctx, attemptId, questionIndex);
    if (mark && (mark.ownerId !== grade.ownerId || mark.studentId !== grade.studentId ||
        mark.snapshotId !== grade.snapshotId))
      throw new Error("INTEGRITY_ERROR: Mark ownership mismatch.");
    return {
      attemptId, questionIndex, prompt: question.prompt, response: answer.text,
      pointsAvailableCents: grade.entries[questionIndex].pointsAvailableCents,
      rubricCriteria: question.rubricCriteria ?? [],
      sampleAnswer: question.sampleAnswer ?? null,
      mark: mark ? { status: mark.status, revision: mark.revision,
        criterionScores: mark.criterionScores, holisticAwardCents: mark.holisticAwardCents ?? null,
        awardedCents: mark.awardedCents, feedback: mark.feedback,
        moderationNote: mark.moderationNote ?? "" } : null,
    };
  },
});

export const save = mutation({
  args: { attemptId: v.id("examAttempts"), questionIndex: v.number(),
    expectedRevision: v.number(), criterionScores: v.array(scoreValidator),
    holisticAwardCents: v.optional(v.number()), feedback: v.string() },
  handler: async (ctx, args) => {
    const { actorId, attempt, snapshot, grade } = await ownedAttempt(ctx, args.attemptId);
    writable(grade);
    const question = pendingQuestion(snapshot, grade, args.questionIndex);
    validateMarkFeedback(args.feedback);
    if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0)
      throw new Error("REVISION_CONFLICT: Invalid revision.");
    const award = calculateEssayAward(question, args.criterionScores, args.holisticAwardCents);
    const old = await markFor(ctx, args.attemptId, args.questionIndex);
    if (old && (old.ownerId !== actorId || old.studentId !== attempt.studentId ||
        old.snapshotId !== snapshot._id)) throw new Error("INTEGRITY_ERROR: Mark ownership mismatch.");
    if ((old?.revision ?? 0) !== args.expectedRevision)
      throw new Error("REVISION_CONFLICT: Mark changed; reload before saving.");
    if (old && old.status !== "draft" && old.status !== "changes_requested")
      throw new Error("GRADING_CONFLICT: Submit/review state must be resolved first.");
    const now = Date.now();
    const row = {
      attemptId: attempt._id, snapshotId: snapshot._id, ownerId: actorId,
      studentId: attempt.studentId, questionIndex: args.questionIndex,
      criterionScores: args.criterionScores, holisticAwardCents: args.holisticAwardCents,
      awardedCents: award, feedback: args.feedback, status: "draft" as const,
      moderationNote: undefined, revision: args.expectedRevision + 1, updatedAt: now,
    };
    if (old) await ctx.db.patch("examEssayMarks", old._id, row);
    else await ctx.db.insert("examEssayMarks", row);
    await audit(ctx, row, "save", row.revision, "Teacher saved a private mark draft.");
    return { revision: row.revision, awardedCents: award, status: row.status };
  },
});

export const submitForReview = mutation({
  args: { attemptId: v.id("examAttempts"), questionIndex: v.number(), expectedRevision: v.number() },
  handler: async (ctx, args) => {
    const { grade, actorId } = await ownedAttempt(ctx, args.attemptId);
    writable(grade);
    const mark = await markFor(ctx, args.attemptId, args.questionIndex);
    if (!mark || mark.ownerId !== actorId || mark.studentId !== grade.studentId ||
        mark.snapshotId !== grade.snapshotId)
      throw new Error("NOT_FOUND: Mark draft not found.");
    if (mark.revision !== args.expectedRevision) throw new Error("REVISION_CONFLICT: Mark changed.");
    if (mark.status !== "draft") throw new Error("GRADING_CONFLICT: Save draft before submission.");
    await ctx.db.patch("examEssayMarks", mark._id, {
      status: "submitted", revision: mark.revision + 1, updatedAt: Date.now(),
    });
    await audit(ctx, mark, "submit", mark.revision + 1, "Sent to teacher moderation.");
    return { revision: mark.revision + 1, status: "submitted" as const };
  },
});

export const moderate = mutation({
  args: { attemptId: v.id("examAttempts"), questionIndex: v.number(),
    expectedRevision: v.number(), decision: v.union(v.literal("approve"), v.literal("changes_requested")),
    note: v.string() },
  handler: async (ctx, args) => {
    const { grade, actorId } = await ownedAttempt(ctx, args.attemptId);
    writable(grade);
    if (args.note.length > 2000 || (args.decision === "changes_requested" && !args.note.trim()))
      throw new Error("INVALID_MARK: Moderation note required for changes.");
    const mark = await markFor(ctx, args.attemptId, args.questionIndex);
    if (!mark || mark.ownerId !== actorId || mark.studentId !== grade.studentId ||
        mark.snapshotId !== grade.snapshotId)
      throw new Error("NOT_FOUND: Mark not found.");
    if (mark.revision !== args.expectedRevision) throw new Error("REVISION_CONFLICT: Mark changed.");
    if (mark.status !== "submitted") throw new Error("GRADING_CONFLICT: Mark not submitted for review.");
    const status = args.decision === "approve" ? "approved" : "changes_requested";
    await ctx.db.patch("examEssayMarks", mark._id, {
      status, moderationNote: args.note, revision: mark.revision + 1, updatedAt: Date.now(),
    });
    await audit(ctx, mark, status === "approved" ? "approve" : "changes_requested",
      mark.revision + 1, args.note);
    return { revision: mark.revision + 1, status };
  },
});

/** Atomic finalization: all nonempty essays must be explicitly moderated and approved. */
export const finalize = mutation({
  args: { attemptId: v.id("examAttempts"), expectedGradeRevision: v.number() },
  handler: async (ctx, { attemptId, expectedGradeRevision }) => {
    const { actorId, attempt, snapshot, grade } = await ownedAttempt(ctx, attemptId);
    writable(grade);
    if (!Number.isSafeInteger(expectedGradeRevision) ||
        (grade.revision ?? 0) !== expectedGradeRevision)
      throw new Error("REVISION_CONFLICT: Grade changed; reload.");
    const marks = await ctx.db.query("examEssayMarks")
      .withIndex("by_attempt_question", q => q.eq("attemptId", attemptId)).take(101);
    if (marks.some(m => m.ownerId !== actorId || m.studentId !== attempt.studentId ||
        m.snapshotId !== snapshot._id || m.status !== "approved"))
      throw new Error("GRADING_CONFLICT: Unapproved or mismatched mark.");
    const approved = marks.map(m => {
      const q = pendingQuestion(snapshot, grade, m.questionIndex);
      const expected = calculateEssayAward(q, m.criterionScores, m.holisticAwardCents);
      if (expected !== m.awardedCents ||
          expected > grade.entries[m.questionIndex].pointsAvailableCents)
        throw new Error("INTEGRITY_ERROR: Tampered rubric marks.");
      return { questionIndex: m.questionIndex, pointsAwardedCents: expected };
    });
    const final = finalEssayGrade(grade, approved);
    const now = Date.now();
    await ctx.db.patch("examGrades", grade._id, {
      ...final, revision: expectedGradeRevision + 1, finalizedAt: now, gradedAt: now,
    });
    await audit(ctx, { attemptId, snapshotId: snapshot._id, ownerId: actorId,
      studentId: attempt.studentId, questionIndex: -1 }, "finalize",
      expectedGradeRevision + 1, "Approved all pending essays and finalized attempt.");
    return { revision: expectedGradeRevision + 1, earnedCents: final.earnedCents,
      finalPercentBasisPoints: final.finalPercentBasisPoints };
  },
});
