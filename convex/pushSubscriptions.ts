import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { requireActiveUser, requireIdentity } from "./authz";
import { allowedPushEndpoint, validWebPushKey } from "./pushModel";
import { mayRead } from "./notifications";

const MAX_DEVICES = 8;

export const enabledOnDevice = query({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const actor = (await requireIdentity(ctx)).subject;
    const row = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", endpoint)).unique();
    return row?.ownerId === actor;
  },
});

/** Account identity is always derived from the signed-in session, never client parameters. */
export const subscribe = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string(), locale: v.union(v.literal("en"), v.literal("ar")) },
  handler: async (ctx, args) => {
    const { identity, user } = await requireActiveUser(ctx);
    if (!user) throw new Error("SIGN_IN_REQUIRED: Account must be active.");
    if (!allowedPushEndpoint(args.endpoint) || !validWebPushKey(args.p256dh, 160) ||
        !validWebPushKey(args.auth, 100))
      throw new Error("INVALID_PUSH_SUBSCRIPTION: Unsupported push provider or invalid keys.");
    const now = Date.now();
    const existing = await ctx.db.query("pushSubscriptions")
      .withIndex("by_endpoint", q => q.eq("endpoint", args.endpoint)).unique();
    if (existing) {
      // A shared browser switching accounts transfers the endpoint, never delivers to both.
      await ctx.db.patch("pushSubscriptions", existing._id, {
        ownerId: identity.subject, p256dh: args.p256dh, auth: args.auth,
        locale: args.locale, updatedAt: now,
        delivered: existing.ownerId === identity.subject ? existing.delivered : [],
      });
    } else {
      const devices = await ctx.db.query("pushSubscriptions")
        .withIndex("by_owner", q => q.eq("ownerId", identity.subject)).take(MAX_DEVICES);
      if (devices.length >= MAX_DEVICES) throw new Error("DEVICE_LIMIT: Disable another device first.");
      await ctx.db.insert("pushSubscriptions", {
        ownerId: identity.subject, ...args, createdAt: now, updatedAt: now, delivered: [],
      });
    }
    return { enabled: true };
  },
});

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const actor = (await requireIdentity(ctx)).subject;
    const row = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", endpoint)).unique();
    if (row?.ownerId === actor) await ctx.db.delete("pushSubscriptions", row._id);
    return { enabled: false };
  },
});

/** Called only by an internal action immediately before sending an external push. */
export const deliveryTargets = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const notice = await ctx.db.get("notifications", notificationId);
    if (!notice || notice.readAt !== undefined) return [];
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", notice.ownerId)).first();
    if (!user || user.isBanned || user.suspendedUntil) return [];
    if (!await mayRead(ctx, notice.ownerId, notice)) return [];
    const prefs = await ctx.db.query("notificationPreferences").withIndex("by_owner", q => q.eq("ownerId", notice.ownerId)).unique();
    if (prefs?.disabled.some(kind => kind === notice.kind)) return [];
    const subs = await ctx.db.query("pushSubscriptions").withIndex("by_owner", q => q.eq("ownerId", notice.ownerId)).take(MAX_DEVICES);
    return subs.filter(sub => !sub.delivered.includes(notificationId)).map(sub => ({
      id: sub._id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, locale: sub.locale,
    }));
  },
});

export const markDelivered = internalMutation({
  args: { subscriptionId: v.id("pushSubscriptions"), notificationId: v.id("notifications") },
  handler: async (ctx, { subscriptionId, notificationId }) => {
    const sub = await ctx.db.get("pushSubscriptions", subscriptionId);
    const notice = await ctx.db.get("notifications", notificationId);
    if (!sub || !notice || sub.ownerId !== notice.ownerId) return;
    await ctx.db.patch("pushSubscriptions", subscriptionId, {
      delivered: [...sub.delivered.filter(id => id !== notificationId), notificationId].slice(-50),
    });
  },
});
export const removeExpired = internalMutation({
  args: { subscriptionId: v.id("pushSubscriptions"), endpoint: v.string() },
  handler: async (ctx, { subscriptionId, endpoint }) => {
    const row = await ctx.db.get("pushSubscriptions", subscriptionId);
    if (row?.endpoint === endpoint) await ctx.db.delete("pushSubscriptions", subscriptionId);
  },
});
