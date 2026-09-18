import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type DbCtx = QueryCtx | MutationCtx;

function configuredAdminUserIds(): Set<string> {
  return new Set(
    (process.env.CHAOS_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export async function requireIdentity(ctx: DbCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity;
}

export async function requireActiveUser(ctx: DbCtx) {
  const identity = await requireIdentity(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .first();
  if (user?.isBanned) {
    throw new Error("ACCOUNT_BANNED: This account is read-only due to moderation.");
  }
  return { identity, user };
}

export async function isAdmin(ctx: DbCtx): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;
  return configuredAdminUserIds().has(identity.subject);
}

export async function requireAdmin(ctx: DbCtx): Promise<void> {
  await requireIdentity(ctx);
  if (!(await isAdmin(ctx))) throw new Error("Forbidden: admin access required");
}

export async function requireQuizOwner(ctx: DbCtx, quizId: Id<"quizzes">): Promise<Doc<"quizzes">> {
  const { identity } = await requireActiveUser(ctx);
  const quiz = await ctx.db.get(quizId);
  if (!quiz || quiz.creatorId !== identity.subject) throw new Error("Quiz not found or unauthorized");
  return quiz;
}

export async function getQuizIfOwner(ctx: DbCtx, quizId: Id<"quizzes">): Promise<Doc<"quizzes"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const quiz = await ctx.db.get(quizId);
  if (!quiz || quiz.creatorId !== identity.subject) return null;
  return quiz;
}

export async function getQuizIfOwnerOrAdmin(ctx: DbCtx, quizId: Id<"quizzes">): Promise<Doc<"quizzes"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const quiz = await ctx.db.get(quizId);
  if (!quiz) return null;
  if (quiz.creatorId === identity.subject) return quiz;
  return (await isAdmin(ctx)) ? quiz : null;
}

export async function requireQuestionOwner(
  ctx: DbCtx,
  questionId: Id<"questions">
): Promise<{ question: Doc<"questions">; quiz: Doc<"quizzes"> }> {
  const { identity } = await requireActiveUser(ctx);
  const question = await ctx.db.get(questionId);
  if (!question) throw new Error("Question not found");
  const quiz = await ctx.db.get(question.quizId);
  if (!quiz || quiz.creatorId !== identity.subject) throw new Error("Question not found or unauthorized");
  return { question, quiz };
}

export async function requireSessionOwner(
  ctx: DbCtx,
  sessionId: Id<"quizSessions">
): Promise<{ session: Doc<"quizSessions">; quiz: Doc<"quizzes"> }> {
  const { identity } = await requireActiveUser(ctx);
  const session = await ctx.db.get(sessionId);
  if (!session) throw new Error("Session not found");
  const quiz = await ctx.db.get(session.quizId);
  if (!quiz || quiz.creatorId !== identity.subject) throw new Error("Session not found or unauthorized");
  return { session, quiz };
}

export async function getSessionIfOwnerOrAdmin(
  ctx: DbCtx,
  sessionId: Id<"quizSessions">
): Promise<{ session: Doc<"quizSessions">; quiz: Doc<"quizzes"> } | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const session = await ctx.db.get(sessionId);
  if (!session) return null;
  const quiz = await ctx.db.get(session.quizId);
  if (!quiz) return null;
  if (quiz.creatorId === identity.subject || (await isAdmin(ctx))) return { session, quiz };
  return null;
}

export async function requireAIJobOwner(ctx: DbCtx, jobId: Id<"aiJobs">): Promise<Doc<"aiJobs">> {
  const { identity } = await requireActiveUser(ctx);
  const job = await ctx.db.get(jobId);
  if (!job || job.clerkId !== identity.subject) throw new Error("AI job not found or unauthorized");
  return job;
}

export async function getAIJobIfOwner(ctx: DbCtx, jobId: Id<"aiJobs">): Promise<Doc<"aiJobs"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const job = await ctx.db.get(jobId);
  if (!job || job.clerkId !== identity.subject) return null;
  return job;
}

export async function canViewQuizAsRespondent(ctx: DbCtx, quiz: Doc<"quizzes">): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  const ownerOrAdmin =
    !!identity && (quiz.creatorId === identity.subject || (await isAdmin(ctx)));
  if (quiz.isBanned) return ownerOrAdmin;
  if (quiz.isPublished) return true;
  return ownerOrAdmin;
}
