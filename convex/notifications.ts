import { getAuthIdentity } from "./authIdentity";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireIdentity } from "./authz";
import { hasApprovedCourseAccess } from "./courseMembership";
import { COURSE_NOTICE_KINDS, courseNoticeKind, type CourseNoticeKind } from "./courseNotificationModel";

type Ctx = QueryCtx | MutationCtx;
export async function mayRead(ctx: Ctx, ownerId: string, notice: Doc<"notifications">) {
  if (notice.adminOnly) {
    const admin = await ctx.db.query("admins")
      .withIndex("by_clerkId", q => q.eq("clerkId", ownerId)).first();
    return !!admin;
  }
  const courseId = notice.courseId;
  if (!courseId) return true;
  const course = await ctx.db.get("learnCollections", courseId);
  return !!course && !course.archived &&
    course.communityState !== "hidden" && course.communityState !== "removed" &&
    (ownerId === course.ownerId ||
     (!!course.publishedVersionId && await hasApprovedCourseAccess(ctx, courseId, ownerId)));
}
export async function notificationsFor(ctx: Ctx, ownerId: string) {
  const rows = await ctx.db.query("notifications")
    .withIndex("by_ownerId_and_createdAt", q => q.eq("ownerId", ownerId))
    .order("desc").take(50);
  const visible = (await Promise.all(rows.map(async n =>
    await mayRead(ctx, ownerId, n) ? n : null))).filter(n => n !== null);
  return {
    items: visible.map(n => ({
      _id: n._id, kind: n.kind, message: n.message, formId: n.formId,
      href: n.href ?? null, createdAt: n.createdAt, read: n.readAt !== undefined,
    })),
    unread: visible.filter(n => n.readAt === undefined).length,
  };
}
export async function preferencesFor(ctx: Ctx, ownerId: string) {
  const row = await ctx.db.query("notificationPreferences")
    .withIndex("by_owner", q => q.eq("ownerId", ownerId)).unique();
  const isAdmin = !!(await ctx.db.query("admins")
    .withIndex("by_clerkId", q => q.eq("clerkId", ownerId)).first());
  return { disabled: row?.disabled ?? [] as CourseNoticeKind[],
    kinds: COURSE_NOTICE_KINDS.filter(kind => kind !== "admin_grading" || isAdmin) };
}
export async function updatePreferenceFor(
  ctx: MutationCtx, ownerId: string, kind: CourseNoticeKind, enabled: boolean,
) {
  const row = await ctx.db.query("notificationPreferences")
    .withIndex("by_owner", q => q.eq("ownerId", ownerId)).unique();
  const disabled = new Set<CourseNoticeKind>(row?.disabled ?? []);
  if (enabled) disabled.delete(kind); else disabled.add(kind);
  if (row) await ctx.db.patch("notificationPreferences", row._id, {
    disabled: [...disabled], updatedAt: Date.now(),
  });
  else await ctx.db.insert("notificationPreferences", {
    ownerId, disabled: [...disabled], updatedAt: Date.now(),
  });
  return preferencesFor(ctx, ownerId);
}
export async function markFor(ctx: MutationCtx, ownerId: string, ids?: Id<"notifications">[]) {
  if (ids && ids.length > 100) throw new Error("LIMIT_REACHED: Too many notification IDs.");
  const rows = ids
    ? (await Promise.all(ids.map(id => ctx.db.get("notifications", id)))).filter(n => n !== null)
    : await ctx.db.query("notifications")
        .withIndex("by_ownerId_and_createdAt", q => q.eq("ownerId", ownerId))
        .order("desc").take(100);
  const now = Date.now();
  for (const n of rows) if (n.ownerId === ownerId && n.readAt === undefined)
    await ctx.db.patch("notifications", n._id, { readAt: now });
}
export const listNotifications = query({
  args: {},
  handler: async ctx => {
    const identity = await getAuthIdentity(ctx);
    return identity ? notificationsFor(ctx, identity.subject) : { items: [], unread: 0 };
  },
});
export const getNotificationPreferences = query({
  args: {}, handler: async ctx => preferencesFor(ctx, (await requireIdentity(ctx)).subject),
});
export const setNotificationPreference = mutation({
  args: { kind: courseNoticeKind, enabled: v.boolean() },
  handler: async (ctx, args) =>
    updatePreferenceFor(ctx, (await requireIdentity(ctx)).subject, args.kind, args.enabled),
});
export const markNotificationsRead = mutation({
  args: { ids: v.optional(v.array(v.id("notifications"))) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    await markFor(ctx, (await requireIdentity(ctx)).subject, ids);
    return null;
  },
});
