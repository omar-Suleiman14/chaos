import { getAuthIdentity } from "./authIdentity";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { type Id } from "./_generated/dataModel";
import { creatorRestricted } from "./authz";
type Ctx = MutationCtx | QueryCtx;
async function actor(ctx: Ctx) {
  const id = await getAuthIdentity(ctx);
  if (!id) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", id.subject))
    .first();
  if (user?.isBanned || user?.suspendedUntil)
    throw new Error("Account restricted");
  return id;
}

export async function homeworkUploadAccess(ctx: Ctx, attemptId: Id<"homeworkAttempts">, now: number) {
    const identity = await actor(ctx);
    const attempt = await ctx.db.get("homeworkAttempts", attemptId);
    if (!attempt || attempt.studentId !== identity.tokenIdentifier) throw new Error("Own attempt required");
    const assignment = await ctx.db.get("homeworkAssignments", attempt.assignmentId);

    if (!assignment || assignment.closed || now < assignment.opensAt || now > assignment.deadline) throw new Error("Assignment not open");
    const enrollment = await ctx.db.query("homeworkEnrollments").withIndex("by_assignmentId_and_studentId", q => q.eq("assignmentId", assignment._id).eq("studentId", identity.subject)).unique();
    if (!enrollment?.active || attempt.startedAt < enrollment.enrolledAt) throw new Error("Active enrollment required");
    if (attempt.responseId || attempt.number < 1 || attempt.number > assignment.maxAttempts || enrollment.attempts > assignment.maxAttempts) throw new Error("Attempt unavailable or limit reached");
    const form = await ctx.db.get("forms", assignment.formId);
    const version = await ctx.db.get("formVersions", assignment.versionId);
    if (!form || form.status === "archived" || form.isBanned || await creatorRestricted(ctx, form.ownerId) || !version || version.formId !== form._id || !version.definition.quiz?.enabled) throw new Error("Assignment content unavailable");
return { identity, attempt, assignment, form, version };
}
