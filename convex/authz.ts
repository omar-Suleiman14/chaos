import { getAuthIdentity } from "./authIdentity";
import type { Doc, Id } from "./_generated/dataModel";
import { supportEmail } from "./support";
import { canEditTeamAsset } from "./businessAccess";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type DbCtx = QueryCtx | MutationCtx;

export async function requireIdentity(ctx: DbCtx) {
  const identity = await getAuthIdentity(ctx);
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
  const identity = await getAuthIdentity(ctx);
  if (!identity) return false;
  const row = await ctx.db.query("admins").withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject)).first();
  return row !== null;
}

export async function requireAdmin(ctx: DbCtx): Promise<void> {
  await requireIdentity(ctx);
  if (!(await isAdmin(ctx))) throw new Error("Forbidden: admin access required");
  // A banned or suspended admin is read-only like any other account (MCP checks the same).
  await requireActiveUser(ctx);
}

// ── Forms ──────────────────────────────────────────────────────────────────
// Form access is owner, editor (edit draft, request publication) or viewer
// (read definition and responses). Collaborators are matched by account id
// or, before first sign-in, by the invited email address.

export type FormRole = "owner" | "editor" | "viewer";
const roleRank: Record<FormRole, number> = { viewer: 1, editor: 2, owner: 3 };

type Identity = NonNullable<Awaited<ReturnType<DbCtx["auth"]["getUserIdentity"]>>>;

/** Email invitations require a positive provider verification claim. */
export function verifiedIdentityEmail(identity: Identity): string | undefined {
  return identity.emailVerified === true ? identity.email?.trim().toLowerCase() : undefined;
}

/** Transports carrying only an account ID must not infer verified email access. */
export function matchesAccountFormCollaborator(row: Doc<"formCollaborators">, userId: string): boolean {
  return row.status !== "pending" && row.status !== "declined" && row.userId === userId;
}

export function matchesFormCollaborator(row: Doc<"formCollaborators">, identity: Identity): boolean {
  return matchesCollaboratorForActor(row, identity.subject, verifiedIdentityEmail(identity));
}

/** `verifiedEmail` is present only for native sign-in with a positive provider claim. */
function matchesCollaboratorForActor(row: Doc<"formCollaborators">, actor: string, verifiedEmail: string | undefined): boolean {
  if (row.status === "declined") return false;
  // Old pending invitations may have been bound through an unverified profile.
  // Accepted and legacy explicit account grants retain their stable ID access.
  if (row.status !== "pending" && row.userId) return matchesAccountFormCollaborator(row, actor);
  return !!verifiedEmail && row.email.toLowerCase() === verifiedEmail;
}

/**
 * The account an email address grants authority to: only an account whose provider verified that
 * address. Unverified profile emails stay usable for display but never resolve here.
 */
export async function userByVerifiedEmail(ctx: DbCtx, email: string): Promise<Doc<"users"> | null> {
  for (const candidate of new Set([email.trim(), email.trim().toLowerCase()])) {
    const rows = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", candidate)).take(20);
    const verified = rows.find((row) => row.emailVerified === true);
    if (verified) return verified;
  }
  return null;
}

export function isFormOwner(form: Doc<"forms">, identity: Identity | null): boolean {
  return !!identity && form.ownerId === identity.subject;
}

export async function formRoleFor(ctx: DbCtx, form: Doc<"forms">, identity: Identity | null): Promise<FormRole | null> {
  return identity ? await formRoleForActor(ctx, form, identity.subject, verifiedIdentityEmail(identity)) : null;
}

/**
 * The single form-role rule for every transport (web, MCP). Account-ID transports pass no
 * email, so pending email invitations only match through verified native sign-in.
 * Moderation freezes non-owner writes: while the form is held or its owner is banned or
 * suspended, team access is withdrawn and direct collaborators can only view.
 */
export async function formRoleForActor(ctx: DbCtx, form: Doc<"forms">, actor: string, verifiedEmail?: string): Promise<FormRole | null> {
  if (form.ownerId === actor) return "owner";
  const moderated = form.isBanned === true || await creatorRestricted(ctx, form.ownerId);
  if (!moderated && await canEditTeamAsset(ctx, actor, { kind: "form", id: form._id })) return "editor";
  const collaborators = await ctx.db
    .query("formCollaborators")
    .withIndex("by_formId", (q) => q.eq("formId", form._id))
    .take(100);
  const role = collaborators.find((c) => matchesCollaboratorForActor(c, actor, verifiedEmail))?.role ?? null;
  return moderated && role === "editor" ? "viewer" : role;
}

export async function getFormIfRole(
  ctx: DbCtx,
  formId: Id<"forms">,
  minimum: FormRole
): Promise<{ form: Doc<"forms">; role: FormRole; identity: Identity } | null> {
  const identity = await getAuthIdentity(ctx);
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
  return restrictedCreatorAccount(user);
}
/** Reuse the exact moderation policy when a read already needs the creator's account. */
export function restrictedCreatorAccount(user: Pick<Doc<"users">, "isBanned" | "suspendedUntil"> | null): boolean {
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
