import type { Doc, Id } from "./_generated/dataModel";
import { supportEmail } from "./support";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type DbCtx = QueryCtx | MutationCtx;

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
  if (user?.suspendedUntil) throw new Error(`ACCOUNT_SUSPENDED: This account is temporarily read-only. Contact ${supportEmail()}.`);
  if (user?.isBanned) {
    throw new Error("ACCOUNT_BANNED: This account is read-only due to moderation.");
  }
  return { identity, user };
}

/**
 * Admins are rows in the `admins` table, keyed by Clerk user id. Only internal
 * mutations (Convex CLI or dashboard) write it, so no admin identity lives in
 * the code and no profile email can grant access.
 */
export async function isAdmin(ctx: DbCtx): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;
  const row = await ctx.db.query("admins").withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject)).first();
  return row !== null;
}

export async function requireAdmin(ctx: DbCtx): Promise<void> {
  await requireIdentity(ctx);
  if (!(await isAdmin(ctx))) throw new Error("Forbidden: admin access required");
}

export async function requireQuizOwner(ctx: DbCtx, quizId: Id<"quizzes">): Promise<Doc<"quizzes">> {
  const { identity } = await requireActiveUser(ctx);
  const quiz = await ctx.db.get("quizzes", quizId);
  if (!quiz || quiz.creatorId !== identity.subject) throw new Error("Quiz not found or unauthorized");
  return quiz;
}

export async function getQuizIfOwner(ctx: DbCtx, quizId: Id<"quizzes">): Promise<Doc<"quizzes"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const quiz = await ctx.db.get("quizzes", quizId);
  if (!quiz || quiz.creatorId !== identity.subject) return null;
  return quiz;
}

export async function getQuizIfOwnerOrAdmin(ctx: DbCtx, quizId: Id<"quizzes">): Promise<Doc<"quizzes"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const quiz = await ctx.db.get("quizzes", quizId);
  if (!quiz) return null;
  if (quiz.creatorId === identity.subject) return quiz;
  return (await isAdmin(ctx)) ? quiz : null;
}

export async function requireQuestionOwner(
  ctx: DbCtx,
  questionId: Id<"questions">
): Promise<{ question: Doc<"questions">; quiz: Doc<"quizzes"> }> {
  const { identity } = await requireActiveUser(ctx);
  const question = await ctx.db.get("questions", questionId);
  if (!question) throw new Error("Question not found");
  const quiz = await ctx.db.get("quizzes", question.quizId);
  if (!quiz || quiz.creatorId !== identity.subject) throw new Error("Question not found or unauthorized");
  return { question, quiz };
}

export async function requireSessionOwner(
  ctx: DbCtx,
  sessionId: Id<"quizSessions">
): Promise<{ session: Doc<"quizSessions">; quiz: Doc<"quizzes"> }> {
  const { identity } = await requireActiveUser(ctx);
  const session = await ctx.db.get("quizSessions", sessionId);
  if (!session) throw new Error("Session not found");
  const quiz = await ctx.db.get("quizzes", session.quizId);
  if (!quiz || quiz.creatorId !== identity.subject) throw new Error("Session not found or unauthorized");
  return { session, quiz };
}

export async function getSessionIfOwnerOrAdmin(
  ctx: DbCtx,
  sessionId: Id<"quizSessions">
): Promise<{ session: Doc<"quizSessions">; quiz: Doc<"quizzes"> } | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const session = await ctx.db.get("quizSessions", sessionId);
  if (!session) return null;
  const quiz = await ctx.db.get("quizzes", session.quizId);
  if (!quiz) return null;
  if (quiz.creatorId === identity.subject || (await isAdmin(ctx))) return { session, quiz };
  return null;
}

export async function canViewQuizAsRespondent(ctx: DbCtx, quiz: Doc<"quizzes">): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  const ownerOrAdmin =
    !!identity && (quiz.creatorId === identity.subject || (await isAdmin(ctx)));
  if (quiz.isBanned || await creatorRestricted(ctx, quiz.creatorId)) return ownerOrAdmin;
  if (quiz.isPublished) return true;
  return ownerOrAdmin;
}

// ── Forms ──────────────────────────────────────────────────────────────────
// Form access is owner, editor (edit draft, request publication) or viewer
// (read definition and responses). Collaborators are matched by account id
// or, before first sign-in, by the invited email address.

export type FormRole = "owner" | "editor" | "viewer";
const roleRank: Record<FormRole, number> = { viewer: 1, editor: 2, owner: 3 };

type Identity = NonNullable<Awaited<ReturnType<DbCtx["auth"]["getUserIdentity"]>>>;

export function isFormOwner(form: Doc<"forms">, identity: Identity | null): boolean {
  return !!identity && form.ownerId === identity.subject;
}

export async function formRoleFor(ctx: DbCtx, form: Doc<"forms">, identity: Identity | null): Promise<FormRole | null> {
  if (!identity) return null;
  if (form.ownerId === identity.subject) return "owner";
  const email = identity.email?.toLowerCase();
  const collaborators = await ctx.db
    .query("formCollaborators")
    .withIndex("by_formId", (q) => q.eq("formId", form._id))
    .take(100);
  const match = collaborators.find((c) => c.userId ? c.userId === identity.subject : (!!email && c.email === email));
  return match ? match.role : null;
}

export async function getFormIfRole(
  ctx: DbCtx,
  formId: Id<"forms">,
  minimum: FormRole
): Promise<{ form: Doc<"forms">; role: FormRole; identity: Identity } | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const form = await ctx.db.get("forms", formId);
  if (!form) return null;
  const role = await formRoleFor(ctx, form, identity);
  if (!role || roleRank[role] < roleRank[minimum]) return null;
  return { form, role, identity };
}

/** For writes: also rejects moderated (banned) accounts. */
export async function requireFormRole(
  ctx: DbCtx,
  formId: Id<"forms">,
  minimum: FormRole
): Promise<{ form: Doc<"forms">; role: FormRole; identity: Identity }> {
  await requireActiveUser(ctx);
  const result = await getFormIfRole(ctx, formId, minimum);
  if (!result) throw new Error("FORM_NOT_FOUND: Form not found or you do not have access.");
  return result;
}

/** Owner-scoped records (templates, saved views, notifications, integration tokens). */
export function ownsRecord(record: { ownerId: string }, identity: Identity): boolean {
  return record.ownerId === identity.subject;
}

/** State is cleared by scheduled mutations so queries stay reactive. */
export async function creatorRestricted(ctx: DbCtx, clerkId: string): Promise<boolean> {
  const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", clerkId)).first();
  return !!(user?.isBanned || user?.suspendedUntil);
}
/** A paid Business seat or admin grant (reporting only). Mutations pass now for exact expiry. */
export function isPaidPlan(user: Doc<"users"> | null, now?: number): boolean {
  if (user?.plan !== undefined) return user.plan === "pro" && !!user.planExpiresAt && (now === undefined || user.planExpiresAt > now);
  return !!user?.isElevated;
}
/** Every account has every feature: Personal is free, Business pays per seat for business use. Bans are checked separately. */
export function hasPro(user: Doc<"users"> | null, _now?: number): boolean {
  return !!user;
}
