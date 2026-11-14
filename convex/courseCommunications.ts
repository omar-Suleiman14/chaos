import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser, creatorRestricted } from "./authz";
import { hasApprovedCourseAccess } from "./courseMembership";
import { cleanClassText, validateClassEvent } from "./courseCommunicationsModel";

type Ctx = QueryCtx | MutationCtx;
const MAX_RECORDS = 80, MAX_MESSAGES = 100;
async function actor(ctx: Ctx) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup.");
  return identity.subject;
}
async function courseFor(ctx: Ctx, courseId: Id<"learnCollections">, ownerOnly = false) {
  const who = await actor(ctx);
  const course = await ctx.db.get("learnCollections", courseId);
  if (!course || course.archived || course.communityState === "removed" ||
      course.communityState === "hidden") throw new Error("NOT_FOUND: Course unavailable.");
  if (who === course.ownerId) {
    if (await creatorRestricted(ctx, who)) throw new Error("NOT_FOUND: Course unavailable.");
    return { course, who, owner: true };
  }
  if (ownerOnly || !course.publishedVersionId ||
      !await hasApprovedCourseAccess(ctx, courseId, who))
    throw new Error("NOT_FOUND: Course unavailable.");
  return { course, who, owner: false };
}
async function audit(ctx: MutationCtx, course: Doc<"learnCollections">,
  actorId: string, kind: string, recordId: string, action: string, revision: number) {
  await ctx.db.insert("courseCommunicationAudit", {
    courseId: course._id, ownerId: course.ownerId, actorId,
    kind, recordId, action, revision, at: Date.now(),
  });
}
async function announcements(ctx: Ctx, courseId: Id<"learnCollections">) {
  const records = await ctx.db.query("courseAnnouncements")
    .withIndex("by_course", q => q.eq("courseId", courseId)).take(MAX_RECORDS + 1);
  if (records.length > MAX_RECORDS) throw new Error("LIMIT_REACHED: Announcements require pagination.");
  return records.sort((a, b) => b.updatedAt - a.updatedAt);
}
async function calendar(ctx: Ctx, courseId: Id<"learnCollections">) {
  const records = await ctx.db.query("courseCalendarEvents")
    .withIndex("by_course", q => q.eq("courseId", courseId)).take(MAX_RECORDS + 1);
  if (records.length > MAX_RECORDS) throw new Error("LIMIT_REACHED: Calendar requires pagination.");
  return records.sort((a, b) => a.startsAt - b.startsAt);
}

export const teacherAnnouncements = query({
  args: { courseId: v.id("learnCollections") },
  handler: async (ctx, { courseId }) => {
    await courseFor(ctx, courseId, true);
    return announcements(ctx, courseId);
  },
});
export const myAnnouncements = query({
  args: { courseId: v.id("learnCollections") },
  handler: async (ctx, { courseId }) => {
    const { course } = await courseFor(ctx, courseId);
    return (await announcements(ctx, courseId))
      .filter(a => a.ownerId === course.ownerId && a.published && !a.archived)
      .map(a => ({ id: a._id, title: a.title, body: a.body, updatedAt: a.updatedAt }));
  },
});
export const createAnnouncement = mutation({
  args: { courseId: v.id("learnCollections"), title: v.string(), body: v.string() },
  handler: async (ctx, { courseId, title, body }) => {
    const { course, who } = await courseFor(ctx, courseId, true);
    if ((await announcements(ctx, courseId)).length >= MAX_RECORDS)
      throw new Error("LIMIT_REACHED: Announcement limit reached.");
    const now = Date.now();
    const id = await ctx.db.insert("courseAnnouncements", {
      courseId, ownerId: who, title: cleanClassText(title, 180, "title"),
      body: cleanClassText(body, 4000, "body"), published: false,
      archived: false, revision: 0, createdAt: now, updatedAt: now,
    });
    await audit(ctx, course, who, "announcement", String(id), "created", 0);
    return id;
  },
});
export const reviseAnnouncement = mutation({
  args: { announcementId: v.id("courseAnnouncements"), expectedRevision: v.number(),
    title: v.string(), body: v.string(), published: v.boolean(), archived: v.boolean() },
  handler: async (ctx, args) => {
    const record = await ctx.db.get("courseAnnouncements", args.announcementId);
    if (!record) throw new Error("NOT_FOUND: Announcement unavailable.");
    const { course, who } = await courseFor(ctx, record.courseId, true);
    if (record.ownerId !== who) throw new Error("NOT_FOUND: Announcement unavailable.");
    if (!Number.isSafeInteger(args.expectedRevision) || record.revision !== args.expectedRevision)
      throw new Error("REVISION_CONFLICT: Reload and try again.");
    const revision = record.revision + 1;
    await ctx.db.patch("courseAnnouncements", record._id, {
      title: cleanClassText(args.title, 180, "title"),
      body: cleanClassText(args.body, 4000, "body"),
      published: args.published && !args.archived,
      archived: args.archived, revision, updatedAt: Date.now(),
    });
    await audit(ctx, course, who, "announcement", String(record._id),
      args.archived ? "archived" : args.published ? "published" : "draft", revision);
    return revision;
  },
});

export const teacherEvents = query({
  args: { courseId: v.id("learnCollections") },
  handler: async (ctx, { courseId }) => {
    await courseFor(ctx, courseId, true);
    return calendar(ctx, courseId);
  },
});
export const myEvents = query({
  args: { courseId: v.id("learnCollections") },
  handler: async (ctx, { courseId }) => {
    const { course } = await courseFor(ctx, courseId);
    return (await calendar(ctx, courseId))
      .filter(e => e.ownerId === course.ownerId && e.published && !e.archived)
      .map(e => ({ id: e._id, title: e.title, details: e.details, location: e.location,
        startsAt: e.startsAt, endsAt: e.endsAt }));
  },
});
export const createEvent = mutation({
  args: { courseId: v.id("learnCollections"), title: v.string(), details: v.string(),
    location: v.string(), startsAt: v.number(), endsAt: v.number() },
  handler: async (ctx, args) => {
    const { course, who } = await courseFor(ctx, args.courseId, true);
    if ((await calendar(ctx, args.courseId)).length >= MAX_RECORDS)
      throw new Error("LIMIT_REACHED: Event limit reached.");
    const now = Date.now(), fields = validateClassEvent(args);
    const id = await ctx.db.insert("courseCalendarEvents", {
      courseId: args.courseId, ownerId: who, ...fields,
      published: false, archived: false, revision: 0, createdAt: now, updatedAt: now,
    });
    await audit(ctx, course, who, "event", String(id), "created", 0);
    return id;
  },
});
export const reviseEvent = mutation({
  args: { eventId: v.id("courseCalendarEvents"), expectedRevision: v.number(),
    title: v.string(), details: v.string(), location: v.string(),
    startsAt: v.number(), endsAt: v.number(), published: v.boolean(), archived: v.boolean() },
  handler: async (ctx, args) => {
    const record = await ctx.db.get("courseCalendarEvents", args.eventId);
    if (!record) throw new Error("NOT_FOUND: Event unavailable.");
    const { course, who } = await courseFor(ctx, record.courseId, true);
    if (record.ownerId !== who) throw new Error("NOT_FOUND: Event unavailable.");
    if (!Number.isSafeInteger(args.expectedRevision) || record.revision !== args.expectedRevision)
      throw new Error("REVISION_CONFLICT: Reload and try again.");
    const fields = validateClassEvent(args), revision = record.revision + 1;
    await ctx.db.patch("courseCalendarEvents", record._id, {
      ...fields, published: args.published && !args.archived,
      archived: args.archived, revision, updatedAt: Date.now(),
    });
    await audit(ctx, course, who, "event", String(record._id),
      args.archived ? "archived" : args.published ? "published" : "draft", revision);
    return revision;
  },
});

/** A private conversation belongs to exactly one approved student; no class-wide inbox leak. */
async function thread(ctx: Ctx, courseId: Id<"learnCollections">, studentId: string) {
  const messages = await ctx.db.query("courseMessages")
    .withIndex("by_course_student_created", q => q.eq("courseId", courseId).eq("studentId", studentId))
    .order("asc").take(MAX_MESSAGES + 1);
  if (messages.length > MAX_MESSAGES) throw new Error("LIMIT_REACHED: Message history requires pagination.");
  return messages;
}
export const conversation = query({
  args: { courseId: v.id("learnCollections"), studentId: v.optional(v.string()) },
  handler: async (ctx, { courseId, studentId }) => {
    const { course, who, owner } = await courseFor(ctx, courseId);
    const target = owner ? studentId : who;
    if (!target || target === course.ownerId ||
        !await hasApprovedCourseAccess(ctx, courseId, target))
      throw new Error("NOT_FOUND: Conversation unavailable.");
    return (await thread(ctx, courseId, target))
      .filter(m => m.ownerId === course.ownerId && m.studentId === target)
      .map(m => ({ id: m._id, body: m.body, senderId: m.senderId, createdAt: m.createdAt,
        isMine: m.senderId === who }));
  },
});
export const sendMessage = mutation({
  args: { courseId: v.id("learnCollections"), studentId: v.optional(v.string()), body: v.string() },
  handler: async (ctx, { courseId, studentId, body }) => {
    const { course, who, owner } = await courseFor(ctx, courseId);
    const target = owner ? studentId : who;
    if (!target || target === course.ownerId ||
        !await hasApprovedCourseAccess(ctx, courseId, target))
      throw new Error("NOT_FOUND: Conversation unavailable.");
    const current = await thread(ctx, courseId, target);
    if (current.length >= MAX_MESSAGES) throw new Error("LIMIT_REACHED: Conversation is full.");
    const now = Date.now();
    if (current.length && now - current[current.length - 1].createdAt < 2000)
      throw new Error("RATE_LIMITED: Please wait before sending another message.");
    const text = cleanClassText(body, 2000, "message");
    const id = await ctx.db.insert("courseMessages", {
      courseId, ownerId: course.ownerId, studentId: target,
      senderId: who, body: text, createdAt: now,
    });
    await audit(ctx, course, who, "message", String(id), "sent", 0);
    return id;
  },
});
