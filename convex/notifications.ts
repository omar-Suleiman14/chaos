import { getAuthIdentity } from "./authIdentity";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ownsRecord, requireIdentity } from "./authz";

export const listNotifications = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return { items: [], unread: 0 };
    const items = await ctx.db
      .query("notifications")
      .withIndex("by_ownerId_and_createdAt", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .take(50);
    return {
      items: items.map((n) => ({ _id: n._id, kind: n.kind, message: n.message, formId: n.formId, createdAt: n.createdAt, read: n.readAt !== undefined })),
      unread: items.filter((n) => n.readAt === undefined).length,
    };
  },
});

export const markNotificationsRead = mutation({
  args: { ids: v.optional(v.array(v.id("notifications"))) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const now = Date.now();
    const rows = args.ids
      ? (await Promise.all(args.ids.slice(0, 100).map((id) => ctx.db.get("notifications", id)))).filter((n) => n !== null)
      : await ctx.db
          .query("notifications")
          .withIndex("by_ownerId_and_createdAt", (q) => q.eq("ownerId", identity.subject))
          .order("desc")
          .take(100);
    for (const n of rows) {
      if (ownsRecord(n, identity) && n.readAt === undefined) await ctx.db.patch("notifications", n._id, { readAt: now });
    }
    return null;
  },
});
