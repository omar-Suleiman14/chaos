import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { HOMEWORK_LIMITS } from "./homeworkModel";
import { gradeQuiz } from "./formQuiz";
type Ctx = MutationCtx | QueryCtx;
async function actor(ctx: Ctx) {
  const id = await ctx.auth.getUserIdentity();
  if (!id) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", id.subject))
    .first();
  if (user?.isBanned || user?.suspendedUntil)
    throw new Error("Account restricted");
  return id;
}
const assignmentArg = { assignmentId: v.id("homeworkAssignments") };
async function owned(
  ctx: Ctx,
  assignmentId: import("convex/values").GenericId<"homeworkAssignments">,
) {
  const identity = await actor(ctx);
  const assignment = await ctx.db.get("homeworkAssignments", assignmentId);
  if (!assignment || assignment.ownerId !== identity.tokenIdentifier)
    throw new Error("Assignment owner required");
  return assignment;
}
export const create = mutation({
  args: {
    formId: v.id("forms"),
    versionId: v.id("formVersions"),
    title: v.string(),
    opensAt: v.number(),
    deadline: v.number(),
    maxAttempts: v.number(),
  },
  returns: v.id("homeworkAssignments"),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const form = await ctx.db.get("forms", args.formId);
    const version = await ctx.db.get("formVersions", args.versionId);
    if (
      !form ||
      form.ownerId !== identity.subject ||
      !version ||
      version.formId !== form._id ||
      !version.definition.quiz?.enabled
    )
      throw new Error("Owned published quiz required");
    if (
      !args.title.trim() ||
      args.title.length > 200 ||
      !Number.isFinite(args.opensAt) ||
      !Number.isFinite(args.deadline) ||
      args.deadline <= Math.max(args.opensAt, Date.now()) ||
      !Number.isInteger(args.maxAttempts) ||
      args.maxAttempts < 1 ||
      args.maxAttempts > HOMEWORK_LIMITS.attempts
    )
      throw new Error("Invalid assignment limits or dates");
    return ctx.db.insert("homeworkAssignments", {
      ...args,
      ownerId: identity.tokenIdentifier,
      closed: false,
      enrollmentCount: 0,
      createdAt: Date.now(),
    });
  },
});
export const enroll = mutation({
  args: { ...assignmentArg, studentId: v.string(), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const assignment = await owned(ctx, args.assignmentId);
    // Host selects a registered account; authorization never derives from this argument.
    const student = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.studentId))
      .first();
    if (!student || student.isBanned || student.suspendedUntil)
      throw new Error("Active registered student required");
    const existing = await ctx.db
      .query("homeworkEnrollments")
      .withIndex("by_assignmentId_and_studentId", (q) =>
        q.eq("assignmentId", assignment._id).eq("studentId", args.studentId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("homeworkEnrollments", existing._id, {
        active: args.active,
      });
      return null;
    }
    if (assignment.enrollmentCount >= HOMEWORK_LIMITS.enrollments)
      throw new Error("Enrollment limit reached");
    await ctx.db.insert("homeworkEnrollments", {
      assignmentId: assignment._id,
      studentId: args.studentId,
      active: args.active,
      enrolledAt: Date.now(),
      attempts: 0,
    });
    await ctx.db.patch("homeworkAssignments", assignment._id, {
      enrollmentCount: assignment.enrollmentCount + 1,
    });
    return null;
  },
});
export const setClosed = mutation({
  args: { ...assignmentArg, closed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await owned(ctx, args.assignmentId);
    await ctx.db.patch("homeworkAssignments", args.assignmentId, {
      closed: args.closed,
    });
    return null;
  },
});
export const startAttempt = mutation({
  args: assignmentArg,
  returns: v.id("homeworkAttempts"),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const assignment = await ctx.db.get(
      "homeworkAssignments",
      args.assignmentId,
    );
    const now = Date.now();
    if (
      !assignment ||
      assignment.closed ||
      now < assignment.opensAt ||
      now > assignment.deadline
    )
      throw new Error("Assignment not open");
    const enrollment = await ctx.db
      .query("homeworkEnrollments")
      .withIndex("by_assignmentId_and_studentId", (q) =>
        q.eq("assignmentId", assignment._id).eq("studentId", identity.subject),
      )
      .unique();
    if (!enrollment?.active || now < enrollment.enrolledAt)
      throw new Error("Active enrollment required");
    const attempts = await ctx.db
      .query("homeworkAttempts")
      .withIndex("by_assignmentId_and_studentId", (q) =>
        q
          .eq("assignmentId", assignment._id)
          .eq("studentId", identity.tokenIdentifier),
      )
      .take(11);
    const pending = attempts.find((a) => !a.responseId);
    if (pending) return pending._id;
    if (enrollment.attempts >= assignment.maxAttempts)
      throw new Error("Attempt limit reached");
    await ctx.db.patch("homeworkEnrollments", enrollment._id, {
      attempts: enrollment.attempts + 1,
    });
    return ctx.db.insert("homeworkAttempts", {
      assignmentId: assignment._id,
      studentId: identity.tokenIdentifier,
      number: enrollment.attempts + 1,
      startedAt: now,
    });
  },
});
export const recordAttempt = mutation({
  args: {
    attemptId: v.id("homeworkAttempts"),
    responseId: v.id("formResponses"),
  },
  returns: v.id("homeworkAttempts"),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const attempt = await ctx.db.get("homeworkAttempts", args.attemptId);
    if (!attempt || attempt.studentId !== identity.tokenIdentifier)
      throw new Error("Own attempt required");
    if (attempt.responseId) {
      if (attempt.responseId !== args.responseId)
        throw new Error("Attempt already recorded");
      return attempt._id;
    }
    const assignment = await ctx.db.get(
      "homeworkAssignments",
      attempt.assignmentId,
    );
    const response = await ctx.db.get("formResponses", args.responseId);
    const version =
      assignment && (await ctx.db.get("formVersions", assignment.versionId));
    const enrollment = await ctx.db
      .query("homeworkEnrollments")
      .withIndex("by_assignmentId_and_studentId", (q) =>
        q
          .eq("assignmentId", attempt.assignmentId)
          .eq("studentId", identity.subject),
      )
      .unique();
    if (
      !assignment ||
      assignment.closed ||
      !enrollment?.active ||
      !version ||
      !response ||
      response.respondentId !== identity.subject ||
      response.status !== "completed" ||
      response.spam ||
      response.formId !== assignment.formId ||
      response.version !== version.version ||
      response.source === "live"
    )
      throw new Error("Eligible completed quiz response required");
    // Edited responses cannot supply original immutable homework evidence.
    if (
      response.editCount ||
      response.editedAt ||
      !Number.isFinite(response.startedAt) ||
      !Number.isFinite(response.submittedAt) ||
      response.startedAt <
        Math.max(
          attempt.startedAt,
          enrollment.enrolledAt,
          assignment.opensAt,
        ) ||
      response.submittedAt < response.startedAt ||
      response.submittedAt > assignment.deadline ||
      response.submittedAt > Date.now()
    )
      throw new Error("Response outside attempt window or edited");
    const duplicate = await ctx.db
      .query("homeworkAttempts")
      .withIndex("by_responseId", (q) => q.eq("responseId", args.responseId))
      .unique();
    if (duplicate) throw new Error("Response already associated with homework");
    const grade = gradeQuiz(version.definition, response.answers);
    if (
      !grade ||
      !Number.isFinite(grade.score) ||
      !Number.isFinite(grade.maxScore) ||
      grade.maxScore <= 0
    )
      throw new Error("Valid graded quiz required");
    await ctx.db.patch("homeworkAttempts", attempt._id, {
      responseId: response._id,
      submittedAt: response.submittedAt,
      score: grade.score,
      maxScore: grade.maxScore,
    });
    return attempt._id;
  },
});
const progress = v.object({
  number: v.number(),
  startedAt: v.number(),
  submittedAt: v.union(v.number(), v.null()),
  score: v.union(v.number(), v.null()),
  maxScore: v.union(v.number(), v.null()),
});
export const myProgress = query({
  args: assignmentArg,
  returns: v.array(progress),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const attempts = await ctx.db
      .query("homeworkAttempts")
      .withIndex("by_assignmentId_and_studentId", (q) =>
        q
          .eq("assignmentId", args.assignmentId)
          .eq("studentId", identity.tokenIdentifier),
      )
      .take(10);
    return attempts.map((a) => ({
      number: a.number,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt ?? null,
      score: a.score ?? null,
      maxScore: a.maxScore ?? null,
    }));
  },
});
export const report = query({
  args: { ...assignmentArg, studentId: v.string() },
  returns: v.array(progress),
  handler: async (ctx, args) => {
    await owned(ctx, args.assignmentId);
    const identity = await actor(ctx);
    const key = `${identity.issuer}|${args.studentId}`;
    const attempts = await ctx.db
      .query("homeworkAttempts")
      .withIndex("by_assignmentId_and_studentId", (q) =>
        q.eq("assignmentId", args.assignmentId).eq("studentId", key),
      )
      .take(10);
    return attempts.map((a) => ({
      number: a.number,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt ?? null,
      score: a.score ?? null,
      maxScore: a.maxScore ?? null,
    }));
  },
});
