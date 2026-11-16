import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { hasApprovedCourseAccess } from "./courseMembership";
import { cleanNoticeKey, cleanNoticeMessage, courseNoticeKind, type CourseNoticeKind } from "./courseNotificationModel";

const FANOUT_PAGE = 25;
const FANOUT_BYTES = 1_000_000;

/** In-app delivery is committed atomically with the triggering domain mutation. */
export async function notifyCourseAccount(ctx: MutationCtx, input: {
  recipientId: string; courseId: Id<"learnCollections">; kind: CourseNoticeKind;
  key: string; message: string;
}) {
  const course = await ctx.db.get("learnCollections", input.courseId);
  if (!course || course.archived || course.communityState === "hidden" ||
      course.communityState === "removed") return null;
  if (course.ownerId !== input.recipientId &&
      (!course.publishedVersionId ||
       !await hasApprovedCourseAccess(ctx, input.courseId, input.recipientId))) return null;
  const key = cleanNoticeKey(input.key);
  const duplicate = await ctx.db.query("notifications")
    .withIndex("by_ownerId_and_dedupeKey", q =>
      q.eq("ownerId", input.recipientId).eq("dedupeKey", key)).unique();
  if (duplicate) return duplicate._id;
  const prefs = await ctx.db.query("notificationPreferences")
    .withIndex("by_owner", q => q.eq("ownerId", input.recipientId)).unique();
  if (prefs?.disabled.includes(input.kind)) return null;
  const path = input.recipientId === course.ownerId
    ? input.kind === "course_grading"
      ? "/dashboard/courses/" + input.courseId + "/exams/grading"
      : "/dashboard/courses/" + input.courseId + "/classroom"
    : input.kind === "course_result" ? "/dashboard/learn/exams/results"
    : "/dashboard/learn/classroom/" + input.courseId;
  const noticeId = await ctx.db.insert("notifications", {
    ownerId: input.recipientId, courseId: input.courseId,
    kind: input.kind, message: cleanNoticeMessage(input.message),
    href: path, dedupeKey: key, createdAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.pushDelivery.deliver, { notificationId: noticeId, attempt: 0 });
  return noticeId;
}

/** Never infer student admission from discovery or guest enrollment records. */
export async function notifyCourseStudents(
  ctx: MutationCtx, courseId: Id<"learnCollections">,
  kind: CourseNoticeKind, key: string, message: string,
) {
  const course = await ctx.db.get("learnCollections", courseId);
  if (!course || !course.publishedVersionId || course.archived) return 0;
  const page = await ctx.db.query("courseJoinRequests")
    .withIndex("by_course_status_requestedAt", q =>
      q.eq("courseId", courseId).eq("status", "approved"))
    .order("asc")
    .paginate({ numItems: FANOUT_PAGE, cursor: null, maximumBytesRead: FANOUT_BYTES });
  const sent = await deliverCourseStudentRows(ctx, course, page.page, kind, key, message);
  if (!page.isDone) await ctx.scheduler.runAfter(0, internal.courseNotifications.deliverCourseStudentPage, {
    courseId, kind, key, message, cursor: page.continueCursor,
  });
  return sent;
}

async function deliverCourseStudentRows(
  ctx: MutationCtx,
  course: Doc<"learnCollections">,
  students: Doc<"courseJoinRequests">[],
  kind: CourseNoticeKind, key: string, message: string,
) {
  let sent = 0;
  for (const student of students) {
    if (student.ownerId !== course.ownerId ||
        !await hasApprovedCourseAccess(ctx, course._id, student.studentId)) continue;
    await notifyCourseAccount(ctx, {
      recipientId: student.studentId, courseId: course._id, kind, key, message,
    });
    sent += 1;
  }
  return sent;
}

export const deliverCourseStudentPage = internalMutation({
  args: { courseId: v.id("learnCollections"), kind: courseNoticeKind,
    key: v.string(), message: v.string(), cursor: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const course = await ctx.db.get("learnCollections", args.courseId);
    if (!course || !course.publishedVersionId || course.archived) return null;
    const page = await ctx.db.query("courseJoinRequests")
      .withIndex("by_course_status_requestedAt", q =>
        q.eq("courseId", args.courseId).eq("status", "approved"))
      .order("asc")
      .paginate({ numItems: FANOUT_PAGE, cursor: args.cursor, maximumBytesRead: FANOUT_BYTES });
    await deliverCourseStudentRows(ctx, course, page.page, args.kind, args.key, args.message);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.courseNotifications.deliverCourseStudentPage, {
      ...args, cursor: page.continueCursor,
    });
    return null;
  },
});


/** Non-sensitive grading queue alerts; only current platform admins receive them. */
export async function notifyPlatformAdmins(ctx: MutationCtx, key: string, message: string) {
  const dedupeKey = cleanNoticeKey(key), safeMessage = cleanNoticeMessage(message);
  const page = await ctx.db.query("admins").paginate({ numItems: FANOUT_PAGE, cursor: null, maximumBytesRead: FANOUT_BYTES });
  const count = await deliverAdminRows(ctx, page.page, dedupeKey, safeMessage);
  if (!page.isDone) await ctx.scheduler.runAfter(0, internal.courseNotifications.deliverAdminPage, {
    key: dedupeKey, message: safeMessage, cursor: page.continueCursor,
  });
  return count;
}

async function deliverAdminRows(ctx: MutationCtx,
  admins: Doc<"admins">[], dedupeKey: string, safeMessage: string) {
  let count = 0;
  for (const admin of admins) {
    const user = await ctx.db.query("users")
      .withIndex("by_clerkId", q => q.eq("clerkId", admin.clerkId)).first();
    if (!user || user.isBanned || user.suspendedUntil) continue;
    const existing = await ctx.db.query("notifications")
      .withIndex("by_ownerId_and_dedupeKey", q =>
        q.eq("ownerId", admin.clerkId).eq("dedupeKey", dedupeKey)).unique();
    if (existing) continue;
    const prefs = await ctx.db.query("notificationPreferences")
      .withIndex("by_owner", q => q.eq("ownerId", admin.clerkId)).unique();
    if (prefs?.disabled.includes("admin_grading")) continue;
    const noticeId = await ctx.db.insert("notifications", {
      ownerId: admin.clerkId, kind: "admin_grading", adminOnly: true,
      message: safeMessage, href: "/admin", dedupeKey,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.pushDelivery.deliver, { notificationId: noticeId, attempt: 0 });
    count++;
  }
  return count;
}

export const deliverAdminPage = internalMutation({
  args: { key: v.string(), message: v.string(), cursor: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("admins").paginate({
      numItems: FANOUT_PAGE, cursor: args.cursor, maximumBytesRead: FANOUT_BYTES,
    });
    await deliverAdminRows(ctx, page.page, args.key, args.message);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.courseNotifications.deliverAdminPage, {
      ...args, cursor: page.continueCursor,
    });
    return null;
  },
});
