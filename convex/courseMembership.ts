import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/** The draft outline wins over the legacy published-items representation, including when empty. */
function courseLessonIds(course: Doc<"learnCollections">) {
  return course.lessonIds ?? course.items.flatMap(item => item.kind === "lesson" ? [item.id] : []);
}

/** Maintain only associations, never copied permissions; the course and team are rechecked at read time. */
export async function syncCourseMembership(ctx: MutationCtx, courseId: Id<"learnCollections">, initialize = false) {
  const course = await ctx.db.get("learnCollections", courseId);
  const wanted = new Set(course ? courseLessonIds(course) : []);
  const existing = await ctx.db.query("courseLessonMemberships").withIndex("by_courseId", q => q.eq("courseId", courseId)).collect();
  for (const edge of existing) {
    if (!wanted.has(edge.lessonId) || edge.ownerId !== course?.ownerId) await ctx.db.delete("courseLessonMemberships", edge._id);
    else wanted.delete(edge.lessonId);
  }
  if (course) for (const lessonId of wanted) await ctx.db.insert("courseLessonMemberships", { courseId, lessonId, ownerId: course.ownerId });
  // A genuinely empty installation needs no backfill. Existing multi-course installations do.
  if (initialize && !await ctx.db.query("courseMembershipState").withIndex("by_key", q => q.eq("key", "v1")).unique()) {
    const courses = await ctx.db.query("learnCollections").take(2);
    if (courses.length === 1 && courses[0]._id === courseId) {
      await ctx.db.insert("courseMembershipState", { key: "v1", complete: true, generation: 0 });
    }
  }
}

/** Exact indexed associations replace a scan over unrelated owner courses after backfill. */
export async function coursesWithLesson(ctx: Pick<QueryCtx | MutationCtx, "db">, ownerId: string, lessonId: Id<"lessons">, order: "asc" | "desc" = "asc") {
  const found = new Map<Id<"learnCollections">, Doc<"learnCollections">>();
  const state = await ctx.db.query("courseMembershipState").withIndex("by_key", q => q.eq("key", "v1")).unique();
  let needsIndex = !!state?.complete;
  if (!state?.complete) {
    // Upgrade compatibility only: the operator backfill removes this historical ceiling.
    const legacy = await ctx.db.query("learnCollections").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", ownerId)).order(order).take(500);
    for (const course of legacy) if (courseLessonIds(course).includes(lessonId)) found.set(course._id, course);
    // A short page already contains every owner course; projections cannot add a valid association.
    needsIndex = legacy.length === 500;
  }
  if (needsIndex) {
    const edges = await ctx.db.query("courseLessonMemberships").withIndex("by_ownerId_and_lessonId", q => q.eq("ownerId", ownerId).eq("lessonId", lessonId)).collect();
    for (const edge of edges) {
      const course = await ctx.db.get("learnCollections", edge.courseId);
      // Stale/imported projection rows never grant access, even before a repair.
      if (course?.ownerId === ownerId && courseLessonIds(course).includes(lessonId)) found.set(course._id, course);
    }
  }
  const direction = order === "asc" ? 1 : -1;
  return [...found.values()].sort((a, b) => direction * (a.updatedAt - b.updatedAt || a._creationTime - b._creationTime || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0)));
}
