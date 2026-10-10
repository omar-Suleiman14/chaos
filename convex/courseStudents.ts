import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthIdentity } from "./authIdentity";
import { requireActiveUser } from "./authz";
import { readCourseProgress, readPublicCourse } from "./courses";
import { recordStudent } from "./studentRoster";
import { consumeRate, sha256Hex } from "./serverUtils";
import { avatarSeed } from "../lib/avatarSeed";

/**
 * Course enrollment. Lessons in a course stay locked until the learner presses Start, which
 * enrolls them (signed in, or as a guest identified by a random token kept on their device)
 * and adds them to the author's Students roster. Course lesson progress is mirrored here so
 * authors see it for guests too, whose study evidence otherwise never leaves the device.
 */

const GUEST_TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const guestArgs = { guestToken: v.optional(v.string()) };

/**
 * The learner's enrollment key: their account when signed in, otherwise a hash of the device token.
 * Writes pass `write`: a banned or suspended account is read-only and cannot enroll or record
 * progress into another author's roster.
 */
async function learner(ctx: QueryCtx | MutationCtx, guestToken: string | undefined, write = false) {
  const identity = await getAuthIdentity(ctx);
  if (identity && write) await requireActiveUser(ctx);
  if (identity) return { key: `user:${identity.subject}`, studentId: identity.subject as string, guestHash: undefined };
  if (!guestToken || !GUEST_TOKEN.test(guestToken)) return null;
  const guestHash = await sha256Hex(guestToken);
  return { key: `guest:${guestHash}`, studentId: undefined, guestHash };
}

async function enrollmentFor(ctx: QueryCtx | MutationCtx, courseId: Id<"learnCollections">, key: string) {
  return ctx.db.query("courseEnrollments").withIndex("by_course_key", q => q.eq("courseId", courseId).eq("key", key)).unique();
}

export const myEnrollment = query({
  args: { courseId: v.string(), ...guestArgs },
  returns: v.object({ enrolled: v.boolean(), owner: v.boolean() }),
  handler: async (ctx, args) => {
    const course = await readPublicCourse(ctx, { courseId: args.courseId });
    if (!course) return { enrolled: false, owner: false };
    const who = await learner(ctx, args.guestToken);
    if (!who) return { enrolled: false, owner: false };
    const row = await ctx.db.get("learnCollections", course.id);
    if (who.studentId && row?.ownerId === who.studentId) return { enrolled: true, owner: true };
    return { enrolled: !!await enrollmentFor(ctx, course.id, who.key), owner: false };
  },
});

export const enroll = mutation({
  args: { courseId: v.string(), guestName: v.optional(v.string()), ...guestArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    const course = await readPublicCourse(ctx, { courseId: args.courseId });
    if (!course) throw new Error("NOT_FOUND: Course unavailable.");
    const who = await learner(ctx, args.guestToken, true);
    if (!who) throw new Error("VALIDATION_FAILED: Sign in or continue as a guest to start this course.");
    const row = await ctx.db.get("learnCollections", course.id);
    if (!row || row.ownerId === who.studentId) return null;
    const guestName = args.guestName?.trim().slice(0, 80) || undefined;
    const now = Date.now();
    const existing = await enrollmentFor(ctx, course.id, who.key);
    if (existing) {
      await ctx.db.patch("courseEnrollments", existing._id, { updatedAt: now, ...(guestName && !who.studentId ? { guestName } : {}) });
      return null;
    }
    if (!who.studentId) await consumeRate(ctx, `course-enroll:${course.id}`, 300, 60_000);
    // Signed-in learners keep the lessons they already finished before enrollment existed.
    const prior = who.studentId ? await readCourseProgress(ctx, { courseId: course.id }) : [];
    const completedLessonIds = prior.filter(p => p.completed).map(p => p.lessonId);
    await ctx.db.insert("courseEnrollments", {
      courseId: course.id, ownerId: row.ownerId, key: who.key, studentId: who.studentId, ...(guestName && !who.studentId ? { guestName } : {}),
      completedLessonIds, enrolledAt: now, updatedAt: now, ...(course.lessons.length && completedLessonIds.length >= course.lessons.length ? { completedAt: now } : {}),
    });
    await recordStudent(ctx, { authorId: row.ownerId, studentId: who.studentId, guestKey: who.guestHash, guestName, context: course.title });
    return null;
  },
});

/** Mirror a course lesson visit (completed omitted) or completion change into the enrollment. No-op when not enrolled. */
export const recordLesson = mutation({
  args: { courseId: v.string(), lessonId: v.string(), completed: v.optional(v.boolean()), ...guestArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    const course = await readPublicCourse(ctx, { courseId: args.courseId });
    const lesson = course?.lessons.find(l => l.id === args.lessonId);
    if (!course || !lesson) return null;
    const who = await learner(ctx, args.guestToken, true);
    const row = who ? await enrollmentFor(ctx, course.id, who.key) : null;
    if (!row) return null;
    const done = new Set(row.completedLessonIds);
    if (args.completed === true) done.add(lesson.id);
    if (args.completed === false) done.delete(lesson.id);
    const completedLessonIds = course.lessons.map(l => l.id).filter(id => done.has(id));
    const finished = completedLessonIds.length === course.lessons.length;
    await ctx.db.patch("courseEnrollments", row._id, {
      completedLessonIds, lastLessonId: lesson.id, updatedAt: Date.now(),
      completedAt: finished ? row.completedAt ?? Date.now() : undefined,
    });
    return null;
  },
});

const DAY = 86_400_000;
const MAX_ROWS = 2000;

/** Owner-only course analytics: headline numbers, completion per lesson and the most recently active students. */
export const analytics = query({
  args: { courseId: v.id("learnCollections") },
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const row = await ctx.db.get("learnCollections", args.courseId);
    if (!row || row.ownerId !== identity.subject) throw new Error("NOT_FOUND: Course not found.");
    const course = await readPublicCourse(ctx, { courseId: args.courseId });
    const lessons = course?.lessons.map(l => ({ id: l.id, title: l.title })) ?? [];
    const rows = await ctx.db.query("courseEnrollments").withIndex("by_course_updated", q => q.eq("courseId", args.courseId)).order("desc").take(MAX_ROWS);
    const now = Date.now();
    const total = lessons.length;
    const percentOf = (r: (typeof rows)[number]) => total ? Math.round(r.completedLessonIds.filter(id => lessons.some(l => l.id === id)).length / total * 100) : 0;
    const perLesson = lessons.map(l => ({ ...l, completed: rows.filter(r => r.completedLessonIds.includes(l.id)).length }));
    const students = await Promise.all(rows.slice(0, 100).map(async r => {
      const user = r.studentId ? await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", r.studentId!)).first() : null;
      const visible = !!user && !user.isBanned && !user.suspendedUntil;
      return {
        id: r._id, guest: !r.studentId,
        name: visible ? user.name : r.guestName || `Guest ${r._id.slice(-4)}`, username: visible ? user.username ?? null : null,
        seed: visible ? avatarSeed(user.clerkId) : avatarSeed(r._id), style: visible ? user.cardStyle ?? 0 : 0,
        completed: r.completedLessonIds.length, percent: percentOf(r), finished: !!r.completedAt,
        lastLesson: lessons.find(l => l.id === r.lastLessonId)?.title ?? null, enrolledAt: r.enrolledAt, lastActive: r.updatedAt,
      };
    }));
    return {
      published: !!course, lessons: total, truncated: rows.length === MAX_ROWS,
      enrolled: rows.length,
      signedIn: rows.filter(r => r.studentId).length,
      guests: rows.filter(r => !r.studentId).length,
      active7d: rows.filter(r => now - r.updatedAt < 7 * DAY).length,
      newThisWeek: rows.filter(r => now - r.enrolledAt < 7 * DAY).length,
      finished: rows.filter(r => r.completedAt).length,
      averagePercent: rows.length ? Math.round(rows.reduce((sum, r) => sum + percentOf(r), 0) / rows.length) : 0,
      perLesson, students,
    };
  },
});
