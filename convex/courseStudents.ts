import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthIdentity } from "./authIdentity";
import { requireActiveUser } from "./authz";
import { readPublicCourse } from "./courses";
import { hasApprovedCourseAccess } from "./courseMembership";
import { avatarSeed } from "../lib/avatarSeed";

/**
 * Course admission is now owner-reviewed. Legacy guest tokens are accepted as
 * inert compatibility arguments but never authorize an enrollment or progress.
 */
const guestArgs = { guestToken: v.optional(v.string()) };

export const myEnrollment = query({
  args: { courseId: v.string(), ...guestArgs },
  returns: v.object({ enrolled: v.boolean(), owner: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return { enrolled: false, owner: false };
    const course = await readPublicCourse(ctx, { courseId: args.courseId });
    if (!course) return { enrolled: false, owner: false };
    const row = await ctx.db.get("learnCollections", course.id);
    return {
      enrolled: await hasApprovedCourseAccess(ctx, course.id, identity.subject),
      owner: row?.ownerId === identity.subject,
    };
  },
});

/** Deny the legacy instant-enrollment API even for signed-in callers. */
export const enroll = mutation({
  args: { courseId: v.string(), guestName: v.optional(v.string()), ...guestArgs },
  returns: v.null(),
  handler: async (ctx) => {
    if (await getAuthIdentity(ctx)) await requireActiveUser(ctx);
    throw new Error("APPROVAL_REQUIRED: Request to join and wait for course-owner approval.");
  },
});

/** Only a student admitted by the doctor may record course progress. */
export const recordLesson = mutation({
  args: { courseId: v.string(), lessonId: v.string(), completed: v.optional(v.boolean()), ...guestArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return null;
    await requireActiveUser(ctx);
    const course = await readPublicCourse(ctx, { courseId: args.courseId });
    const lesson = course?.lessons.find(l => l.id === args.lessonId);
    if (!course || !lesson || !await hasApprovedCourseAccess(ctx, course.id, identity.subject)) return null;
    const row = await ctx.db.query("courseEnrollments")
      .withIndex("by_course_key", q => q.eq("courseId", course.id).eq("key", `user:${identity.subject}`))
      .unique();
    if (!row || row.studentId !== identity.subject) return null;
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
