import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { hasApprovedCourseAccess } from "./courseMembership";
import { cleanNoticeKey, cleanNoticeMessage, type CourseNoticeKind } from "./courseNotificationModel";

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
    ? "/dashboard/courses/" + input.courseId + "/classroom"
    : "/dashboard/learn/classroom/" + input.courseId;
  return await ctx.db.insert("notifications", {
    ownerId: input.recipientId, courseId: input.courseId,
    kind: input.kind, message: cleanNoticeMessage(input.message),
    href: path, dedupeKey: key, createdAt: Date.now(),
  });
}

/** Never infer student admission from discovery or guest enrollment records. */
export async function notifyCourseStudents(
  ctx: MutationCtx, courseId: Id<"learnCollections">,
  kind: CourseNoticeKind, key: string, message: string,
) {
  const course = await ctx.db.get("learnCollections", courseId);
  if (!course || !course.publishedVersionId || course.archived) return 0;
  const students = await ctx.db.query("courseJoinRequests")
    .withIndex("by_course_status_requestedAt", q =>
      q.eq("courseId", courseId).eq("status", "approved")).take(81);
  if (students.length > 80)
    throw new Error("LIMIT_REACHED: Course notifications need paginated fanout.");
  let sent = 0;
  for (const student of students) {
    if (student.ownerId !== course.ownerId ||
        !await hasApprovedCourseAccess(ctx, courseId, student.studentId)) continue;
    await notifyCourseAccount(ctx, {
      recipientId: student.studentId, courseId, kind, key, message,
    });
    sent += 1;
  }
  return sent;
}
