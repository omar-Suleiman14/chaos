import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation, internalQuery, internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireActiveUser } from "./authz";
import { getAuthIdentity } from "./authIdentity";
import { userByUsername } from "./usernameModel";
import { requireLearnActor } from "./mcpLearn";
import { avatarSeed } from "../lib/avatarSeed";

/** Call only after a validated interaction. Anonymous experiences never acquire account identity here. */
export async function recordStudent(ctx: MutationCtx, input: { authorId: string; studentId?: string; guestKey?: string; guestName?: string; context: string }) {
  if (input.authorId === input.studentId) return;
  const key = input.studentId ? `user:${input.studentId}` : `guest:${input.guestKey}`;
  if (!input.studentId && !input.guestKey) return;
  const existing = await ctx.db.query("authorStudents").withIndex("by_author_key", q => q.eq("authorId", input.authorId).eq("key", key)).unique();
  const fields = { context: input.context.slice(0, 200), updatedAt: Date.now(), ...(input.guestName ? { guestName: input.guestName.slice(0, 80) } : {}) };
  if (existing) { await ctx.db.patch("authorStudents", existing._id, fields); return; }
  await ctx.db.insert("authorStudents", { authorId: input.authorId, key, studentId: input.studentId, publicVisible: true, ...fields });
  const count = await ctx.db.query("authorStudentCounts").withIndex("by_author", q => q.eq("authorId", input.authorId)).unique();
  if (count) await ctx.db.patch("authorStudentCounts", count._id, { count: count.count + 1 });
  else await ctx.db.insert("authorStudentCounts", { authorId: input.authorId, count: 1 });
}
export async function pageFor(ctx: QueryCtx, authorId: string, options: { numItems: number; cursor: string | null }, isPublic = false) {
  // Include legacy rows created under the former private-by-default policy.
  // Explicit opt-outs are distinct from that old default and are applied below.
  const rows = ctx.db.query("authorStudents").withIndex("by_author_updated", q => q.eq("authorId", authorId));
  const result = await rows.order("desc").paginate({ ...options, numItems: Math.min(48, Math.max(1, options.numItems)), maximumBytesRead: 500_000 });
  const mapped = await Promise.all(result.page.map(async row => {
    const user = row.studentId ? await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", row.studentId!)).first() : null;
    const visible = user && !user.isBanned && !user.suspendedUntil;
    if (isPublic && (!visible || user.hideStudentCards || row.publicHidden)) return null;
    return { id: row._id, name: visible ? user.name : row.guestName || `Guest ${row._id.slice(-6)}`, username: visible ? user.username : null,
      seed: visible ? user.cardAvatarSeed ?? avatarSeed(user.clerkId) : avatarSeed(row._id), style: visible ? user.cardStyle ?? 0 : 0, context: isPublic ? null : row.context };
  }));
  return { ...result, page: mapped.filter((row): row is NonNullable<typeof row> => row !== null) };
}
export const mine = query({ args: { paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); return pageFor(ctx, identity.subject, args.paginationOpts);
} });
export const count = query({ args: {}, handler: async ctx => { const { identity } = await requireActiveUser(ctx); return (await ctx.db.query("authorStudentCounts").withIndex("by_author", q => q.eq("authorId", identity.subject)).unique())?.count ?? 0; } });
export const publicStudents = query({ args: { username: v.string(), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  const author = await userByUsername(ctx, args.username.trim().toLowerCase());
  if (!author || author.isBanned || author.suspendedUntil) return { page: [], isDone: true, continueCursor: "" };
  return pageFor(ctx, author.clerkId, args.paginationOpts, true);
} });
export const myVisibility = query({ args: { username: v.string() }, handler: async (ctx, args) => {
  const identity = await getAuthIdentity(ctx); if (!identity) return null;
  const author = await userByUsername(ctx, args.username.trim().toLowerCase()); if (!author) return null;
  const row = await ctx.db.query("authorStudents").withIndex("by_author_key", q => q.eq("authorId", author.clerkId).eq("key", `user:${identity.subject}`)).unique();
  if (!row) return null;
  const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", identity.subject)).first();
  return !user?.hideStudentCards && !row.publicHidden;
} });
async function setVisibility(ctx: MutationCtx, studentId: string, username: string, visible: boolean) {
  const author = await userByUsername(ctx, username.trim().toLowerCase()); if (!author) throw new Error("Author unavailable");
  const row = await ctx.db.query("authorStudents").withIndex("by_author_key", q => q.eq("authorId", author.clerkId).eq("key", `user:${studentId}`)).unique();
  if (!row) throw new Error("VALIDATION_FAILED: No student relationship to update");
  await ctx.db.patch("authorStudents", row._id, { publicVisible: visible, publicHidden: !visible }); return { ok: true };
}
export async function setGlobalStudentVisibility(ctx: MutationCtx, userId: string, visible: boolean) {
  const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", userId)).unique();
  if (!user) throw new Error("ACCOUNT_REQUIRED: Sign in first.");
  await ctx.db.patch("users", user._id, { hideStudentCards: !visible }); return { ok: true };
}
export const setGlobalVisibility = mutation({ args: { visible: v.boolean() }, handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); return setGlobalStudentVisibility(ctx, identity.subject, args.visible);
} });
export const setPublicVisibility = mutation({ args: { username: v.string(), visible: v.boolean() }, handler: async (ctx, args) => { const { identity } = await requireActiveUser(ctx); return setVisibility(ctx, identity.subject, args.username, args.visible); } });
export const mcpList = internalQuery({ args: { userId: v.string(), cursor: v.optional(v.string()), limit: v.optional(v.number()) }, handler: async (ctx, args) => { await requireLearnActor(ctx, args.userId); return pageFor(ctx, args.userId, { cursor: args.cursor ?? null, numItems: args.limit ?? 24 }); } });
export const mcpVisibility = internalMutation({ args: { userId: v.string(), username: v.string(), visible: v.boolean() }, handler: async (ctx, args) => { await requireLearnActor(ctx, args.userId); return setVisibility(ctx, args.userId, args.username, args.visible); } });
