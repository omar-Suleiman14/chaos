import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireActiveUser } from "./authz";

/**
 * Private examiner projection. PR22 owns student results and release policy.
 * Never expose this query through public courses, candidate APIs or student MCP.
 */
export const getOwnerGrade = query({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    const { identity, user } = await requireActiveUser(ctx);
    if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
    const attempt = await ctx.db.get("examAttempts", attemptId);
    if (!attempt || attempt.ownerId !== identity.subject ||
      attempt.state !== "submitted")
      throw new Error("NOT_FOUND: Submitted exam grade not found.");
    const [snapshot, course, grade] = await Promise.all([
      ctx.db.get("examSnapshots", attempt.snapshotId),
      ctx.db.get("learnCollections", attempt.courseId),
      ctx.db.query("examGrades")
        .withIndex("by_attempt", q => q.eq("attemptId", attemptId)).unique(),
    ]);
    if (!snapshot || !course || !grade ||
      snapshot.ownerId !== identity.subject ||
      snapshot.courseId !== course._id || course.ownerId !== identity.subject ||
      grade.snapshotId !== attempt.snapshotId ||
      grade.ownerId !== identity.subject ||
      grade.studentId !== attempt.studentId)
      throw new Error("NOT_FOUND: Submitted exam grade not found.");
    // No correctChoiceIds, prompts, model answers, explanations or media in this view.
    return {
      attemptId, snapshotId: grade.snapshotId, studentId: grade.studentId,
      state: grade.state, earnedCents: grade.earnedCents,
      maximumCents: grade.maximumCents,
      objectiveMaximumCents: grade.objectiveMaximumCents,
      pendingWrittenCount: grade.pendingWrittenCount,
      finalPercentBasisPoints: grade.finalPercentBasisPoints,
      algorithmVersion: grade.algorithmVersion, gradedAt: grade.gradedAt,
      entries: grade.entries.map(entry => ({
        ...entry,
        rubricCriteria: snapshot.questions[entry.questionIndex]?.rubricCriteria ?? [],
      })),
    };
  },
});
