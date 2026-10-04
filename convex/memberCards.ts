import { getAuthIdentity } from "./authIdentity";
import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireActiveUser } from "./authz";
import { avatarSeed } from "../lib/avatarSeed";
import { requireLearnActor } from "./mcpLearn";
import { usernameProblem } from "./links";
import { reserveUsername, userByUsername } from "./usernameModel";

const card = v.object({ name: v.string(), username: v.string(), seed: v.string(), memberSince: v.number(), style: v.number() });
const view = (u: Doc<"users">) => ({ name: u.name, username: u.username, seed: u.cardAvatarSeed ?? avatarSeed(u.clerkId), memberSince: u.createdAt, style: u.cardStyle ?? 0 });
export async function readPublicCard(ctx: QueryCtx, input: string) {
  const username = input.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username)) return null;
  const user = await userByUsername(ctx, username);
  return !user || user.isBanned || user.suspendedUntil ? null : view(user);
}

/** The signed-in person's card (null before their account row exists). */
export const mine = query({
  args: {},
  returns: v.union(card, v.null()),
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return null;
    const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject)).first();
    return user ? view(user) : null;
  },
});

/** Public card behind the QR code: name, username, avatar seed, join date and theme only. */
export const byUsername = query({
  args: { username: v.string() },
  returns: v.union(card, v.null()),
  handler: async (ctx, args) => {
    return readPublicCard(ctx, args.username);
  },
});

export const setStyle = mutation({
  args: { style: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await requireActiveUser(ctx);
    if (!user) throw new Error("ACCOUNT_REQUIRED: Finish signing in first.");
    if (!Number.isInteger(args.style) || args.style < 0 || args.style > 31) throw new Error("VALIDATION_FAILED: Unknown card style.");
    await ctx.db.patch("users", user._id, { cardStyle: args.style });
    return null;
  },
});

const customization = { name: v.optional(v.string()), username: v.optional(v.string()), style: v.optional(v.number()), avatar: v.optional(v.number()), finishOnboarding: v.optional(v.boolean()), skip: v.optional(v.boolean()) };
async function customize(ctx: MutationCtx, user: Doc<"users">, args: { name?: string; username?: string; style?: number; avatar?: number; finishOnboarding?: boolean; skip?: boolean }) {
  const updates: Partial<Doc<"users">> = {};
  if (!args.skip) {
    if (args.name !== undefined) { const name = args.name.trim(); if (!name || name.length > 100) throw new Error("Name must be 1–100 characters"); updates.name = name; updates.profileNameChosen = true; }
    if (args.username !== undefined) { const username = args.username.trim().toLowerCase(); const problem = usernameProblem(username); if (problem) throw new Error(`INVALID_USERNAME: ${problem}`); await reserveUsername(ctx, user.username, user.clerkId); await reserveUsername(ctx, username, user.clerkId); updates.username = username; updates.usernameChosen = true; }
    if (args.style !== undefined) { if (!Number.isInteger(args.style) || args.style < 0 || args.style > 31) throw new Error("Invalid card style"); updates.cardStyle = args.style; }
    if (args.avatar !== undefined) { if (!Number.isInteger(args.avatar) || args.avatar < 0 || args.avatar > 7) throw new Error("Invalid avatar"); updates.cardAvatarSeed = `${avatarSeed(user.clerkId)}:avatar:${args.avatar}`; }
  }
  if (args.finishOnboarding || args.skip) { updates.cardOnboardingPending = false; updates.cardOnboardingCompletedAt = Date.now(); }
  await ctx.db.patch("users", user._id, updates);
  return view({ ...user, ...updates });
}
export const customizeCard = mutation({ args: customization, returns: card, handler: async (ctx, args) => { const { user } = await requireActiveUser(ctx); if (!user) throw new Error("Account required"); return customize(ctx, user, args); } });
export const mcpMine = internalQuery({ args: { userId: v.string() }, returns: card, handler: async (ctx, args) => { await requireLearnActor(ctx, args.userId); const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.userId)).unique(); if (!user) throw new Error("Account required"); return view(user); } });
export const mcpCustomize = internalMutation({ args: { userId: v.string(), ...customization }, returns: card, handler: async (ctx, { userId, ...args }) => { await requireLearnActor(ctx, userId); const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", userId)).unique(); if (!user) throw new Error("Account required"); return customize(ctx, user, args); } });
