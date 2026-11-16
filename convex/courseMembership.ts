import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/** The draft outline wins over the legacy published-items representation, including when empty. */
function courseLessonIds(course: Doc<"learnCollections">) {
  return course.lessonIds ?? course.items.flatMap(item => item.kind === "lesson" ? [item.id] : []);
}

/** Unpublishing or archiving must not turn previously protected content into a public standalone asset. */
export async function courseProtectionVersion(ctx: Pick<QueryCtx | MutationCtx, "db">, course: Doc<"learnCollections">) {
  const version = course.publishedVersionId
    ? await ctx.db.get("collectionVersions", course.publishedVersionId)
    : await ctx.db.query("collectionVersions").withIndex("by_collectionId_and_number", q => q.eq("collectionId", course._id)).order("desc").first();
  return version?.collectionId === course._id ? version : null;
}

/** Include the published snapshot until it is replaced, even when the draft removes a lesson. */
async function allCourseLessonIds(ctx: Pick<QueryCtx | MutationCtx, "db">, course: Doc<"learnCollections">) {
  const ids = new Set(courseLessonIds(course));
  const published = await courseProtectionVersion(ctx, course);
  if (published?.collectionId === course._id) {
    for (const item of published.items) if (item.kind === "lesson") ids.add(item.id);
  }
  return ids;
}

/** Maintain only associations, never copied permissions; the course and team are rechecked at read time. */
export async function syncCourseMembership(ctx: MutationCtx, courseId: Id<"learnCollections">, initialize = false) {
  const course = await ctx.db.get("learnCollections", courseId);
  const wanted = new Set(course ? await allCourseLessonIds(ctx, course) : []);
  const existing = await ctx.db.query("courseLessonMemberships").withIndex("by_courseId", q => q.eq("courseId", courseId)).collect();
  for (const edge of existing) {
    if (!wanted.has(edge.lessonId) || edge.ownerId !== course?.ownerId) await ctx.db.delete("courseLessonMemberships", edge._id);
    else wanted.delete(edge.lessonId);
  }
  if (course) for (const lessonId of wanted) await ctx.db.insert("courseLessonMemberships", { courseId, lessonId, ownerId: course.ownerId });
  // A genuinely empty installation needs no backfill. Existing multi-course installations do.
  if (initialize && !await ctx.db.query("courseMembershipState").withIndex("by_key", q => q.eq("key", "v2")).unique()) {
    const courses = await ctx.db.query("learnCollections").take(2);
    if (courses.length === 1 && courses[0]._id === courseId) {
      await ctx.db.insert("courseMembershipState", { key: "v2", complete: true, generation: 0 });
    }
  }
}

/** Exact indexed associations replace a scan over unrelated owner courses after backfill. */
export async function coursesWithLesson(ctx: Pick<QueryCtx | MutationCtx, "db">, ownerId: string, lessonId: Id<"lessons">, order: "asc" | "desc" = "asc", failClosed = false) {
  const found = new Map<Id<"learnCollections">, Doc<"learnCollections">>();
  const state = await ctx.db.query("courseMembershipState").withIndex("by_key", q => q.eq("key", "v2")).unique();
  let needsIndex = !!state?.complete;
  if (!state?.complete) {
    // Upgrade compatibility only: the operator backfill removes this historical ceiling.
    const legacy = await ctx.db.query("learnCollections").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", ownerId)).order(order).take(500);
    for (const course of legacy) if ((await allCourseLessonIds(ctx, course)).has(lessonId)) found.set(course._id, course);
    // A short page already contains every owner course; projections cannot add a valid association.
    needsIndex = legacy.length === 500;
    // A partial migration can miss older courses beyond this bounded page.
    if (failClosed && needsIndex) throw new Error("NOT_FOUND: Course membership backfill required.");
  }
  if (needsIndex) {
    const edges = await ctx.db.query("courseLessonMemberships").withIndex("by_ownerId_and_lessonId", q => q.eq("ownerId", ownerId).eq("lessonId", lessonId)).collect();
    for (const edge of edges) {
      const course = await ctx.db.get("learnCollections", edge.courseId);
      // Stale/imported projection rows never grant access, even before a repair.
      if (course?.ownerId === ownerId && (await allCourseLessonIds(ctx, course)).has(lessonId)) found.set(course._id, course);
    }
  }
  const direction = order === "asc" ? 1 : -1;
  return [...found.values()].sort((a, b) => direction * (a.updatedAt - b.updatedAt || a._creationTime - b._creationTime || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0)));
}


/**
 * Approval and enrollment must both exist. Historical self-enrollments and guest
 * tokens are never admission grants; only the course owner's reviewed request
 * can authorize reading content.
 */
export async function hasApprovedCourseAccess(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  courseId: Id<"learnCollections">,
  actor: string | null,
): Promise<boolean> {
  if (!actor) return false;
  const course = await ctx.db.get("learnCollections", courseId);
  if (!course) return false;
  if (course.ownerId === actor) return true;
  const request = await ctx.db.query("courseJoinRequests")
    .withIndex("by_course_student", q => q.eq("courseId", courseId).eq("studentId", actor))
    .unique();
  if (request?.status !== "approved" || request.ownerId !== course.ownerId) return false;
  const enrollment = await ctx.db.query("courseEnrollments")
    .withIndex("by_course_key", q => q.eq("courseId", courseId).eq("key", `user:${actor}`))
    .unique();
  return enrollment?.studentId === actor && enrollment.ownerId === course.ownerId;
}

/**
 * A published lesson included in a live course cannot be fetched through a
 * generic public lesson, version, progress or MCP route without admission.
 * Standalone lessons not published in a course retain their normal visibility.
 */
export async function canReadCourseAttachedLesson(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  ownerId: string,
  lessonId: Id<"lessons">,
  actor: string | null,
): Promise<boolean> {
  if (actor === ownerId) return true;
  let protectedLesson = false;
  for (const course of await coursesWithLesson(ctx, ownerId, lessonId, "asc", true)) {
    const published = await courseProtectionVersion(ctx, course);
    if (published?.collectionId !== course._id ||
      !published.items.some(item => item.kind === "lesson" && item.id === lessonId)) continue;
    protectedLesson = true;
    if (!course.publishedVersionId || course.archived ||
      course.communityState === "hidden" || course.communityState === "removed") continue;
    if (await hasApprovedCourseAccess(ctx, course._id, actor)) return true;
  }
  return !protectedLesson;
}
