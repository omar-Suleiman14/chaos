import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireActiveUser } from "./authz";
import { avatarSeed } from "../lib/avatarSeed";

const card = v.object({ name: v.string(), username: v.string(), seed: v.string(), memberSince: v.number(), style: v.number() });
const view = (u: Doc<"users">) => ({ name: u.name, username: u.username, seed: avatarSeed(u.clerkId), memberSince: u.createdAt, style: u.cardStyle ?? 0 });

/** The signed-in person's card (null before their account row exists). */
export const mine = query({
  args: {},
  returns: v.union(card, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
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
    const user = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", args.username.trim().toLowerCase())).first();
    if (!user || user.isBanned || user.suspendedUntil) return null;
    return view(user);
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
