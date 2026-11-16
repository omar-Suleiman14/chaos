import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireLearnActor } from "./mcpLearn";
import {
  notificationsFor, preferencesFor, markFor, updatePreferenceFor,
} from "./notifications";
import { courseNoticeKind } from "./courseNotificationModel";

/** The actor comes only from the authenticated, secret-protected MCP transport. */
export const list = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) =>
    notificationsFor(ctx, await requireLearnActor(ctx, userId)),
});
export const preferences = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) =>
    preferencesFor(ctx, await requireLearnActor(ctx, userId)),
});
export const markRead = internalMutation({
  args: { userId: v.string(), ids: v.optional(v.array(v.string())) },
  handler: async (ctx, { userId, ids }) => {
    const actor = await requireLearnActor(ctx, userId);
    if (ids && ids.length > 100) throw new Error("LIMIT_REACHED: Too many notification IDs.");
    const checked = ids?.map(raw => {
      const id = ctx.db.normalizeId("notifications", raw);
      if (!id) throw new Error("VALIDATION_FAILED: Invalid notification ID.");
      return id;
    });
    await markFor(ctx, actor, checked);
    return { ok: true };
  },
});
export const setPreference = internalMutation({
  args: { userId: v.string(), kind: courseNoticeKind, enabled: v.boolean() },
  handler: async (ctx, { userId, kind, enabled }) =>
    updatePreferenceFor(ctx, await requireLearnActor(ctx, userId), kind, enabled),
});
