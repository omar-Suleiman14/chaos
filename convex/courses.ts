import { v, type Infer } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser, isPaidPlan, creatorRestricted } from "./authz";
import { createLessonForActor, publishLessonForActor } from "./lessons";
import { requireVisibilityAllowed } from "./plans";
import { visibility } from "./learnModel";
import { recordAssetPublicationAction } from "./learnPublicationAudit";
import { enqueueLearnWebhookEvent } from "./learnWebhookEvents";

/**
 * Courses are created like forms: a titled, ordered set of lessons that is published as
 * one thing. Stored as a learnCollection: `lessonIds` is the draft outline, `items` the
 * published snapshot. Public courses are free for everyone; private ones need Business.
 */
const MAX_LESSONS = 100;

/** Signed-in caller, or a server-verified actor (ChatGPT app) when `actor` is given. */
async function ownedCourse(ctx: QueryCtx | MutationCtx, courseId: Id<"learnCollections">, asActor?: string) {
  let subject = asActor, user: Doc<"users"> | null;
  if (subject === undefined) { const r = await requireActiveUser(ctx); subject = r.identity.subject; user = r.user ?? null; }
  else user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", subject!)).first();
  const row = await ctx.db.get("learnCollections", courseId);
  if (!row || row.ownerId !== subject) throw new Error("NOT_FOUND: Course not found.");
  return { row, actor: subject, user };
}
const outline = (row: Doc<"learnCollections">) => row.lessonIds ?? row.items.flatMap((i) => (i.kind === "lesson" ? [i.id] : []));

export const courseCard = v.object({
  id: v.id("learnCollections"), title: v.string(), description: v.string(), coverUrl: v.optional(v.string()), lessons: v.number(),
  visibility, published: v.boolean(), updatedAt: v.number(), archived: v.boolean(),
});
/** Library card for an owned course; shared by the dashboard and the ChatGPT app. */
export const toCourseCard = (r: Doc<"learnCollections">): Infer<typeof courseCard> => ({ id: r._id, title: r.metadata.title, description: r.metadata.description, coverUrl: r.metadata.coverUrl, lessons: outline(r).length, visibility: r.visibility, published: !!r.publishedVersionId, updatedAt: r.updatedAt, archived: !!r.archived });

export const listMine = query({
  args: {},
  returns: v.array(courseCard),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db.query("learnCollections").withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", identity.subject)).order("desc").take(200);
    return rows.map(toCourseCard);
  },
});

const lessonRow = v.object({ id: v.id("lessons"), title: v.string(), description: v.string(), published: v.boolean(), changed: v.boolean(), blocks: v.number() });

/** Owner view for the course builder. */
const getArgs = v.object({ courseId: v.id("learnCollections") });
export async function getCourse(ctx: QueryCtx, args: Infer<typeof getArgs>, asActor?: string) {
    const { row, user } = await ownedCourse(ctx, args.courseId, asActor);
    const version = row.publishedVersionId ? await ctx.db.get("collectionVersions", row.publishedVersionId) : null;
    const lessons = [];
    for (const id of outline(row)) {
      const lesson = await ctx.db.get("lessons", id);
      if (!lesson || lesson.status !== "active") continue;
      const pub = lesson.publishedVersionId ? await ctx.db.get("lessonVersions", lesson.publishedVersionId) : null;
      lessons.push({ id, title: lesson.metadata.title, description: lesson.metadata.description, published: !!pub, changed: !pub || JSON.stringify(pub.document) !== JSON.stringify(lesson.draft) || JSON.stringify(pub.metadata) !== JSON.stringify(lesson.metadata), blocks: lesson.draft.blocks.length });
    }
    return {
      id: row._id, title: row.metadata.title, description: row.metadata.description, coverUrl: row.metadata.coverUrl, coverY: row.metadata.coverY, icon: row.metadata.icon, language: row.metadata.language, tags: row.metadata.tags,
      visibility: row.visibility, published: !!row.publishedVersionId, publishedAt: version?.publishedAt ?? null, canPrivate: isPaidPlan(user ?? null, Date.now()), lessons, revision: row.revision,
    };
}
export const get = query({
  args: getArgs.fields,
  returns: v.object({
    id: v.id("learnCollections"), title: v.string(), description: v.string(), coverUrl: v.optional(v.string()), coverY: v.optional(v.number()), icon: v.optional(v.string()), language: v.string(), tags: v.array(v.string()),
    visibility, published: v.boolean(), publishedAt: v.union(v.number(), v.null()), canPrivate: v.boolean(), lessons: v.array(lessonRow), revision: v.number(),
  }),
  handler: (ctx, args) => getCourse(ctx, args),
});

export async function createCourse(ctx: MutationCtx, args: { title?: string; language?: string }, actor?: string) {
    const identity = { subject: actor ?? (await requireActiveUser(ctx)).identity.subject };
    const title = (args.title ?? "").trim().slice(0, 200) || "Untitled course";
    const now = Date.now();
    const id = await ctx.db.insert("learnCollections", { ownerId: identity.subject, metadata: { title, description: "", language: args.language?.slice(0, 35) || "en", tags: [] }, items: [], lessonIds: [], revision: 0, visibility: "public", communityState: "ok", createdAt: now, updatedAt: now });
    await recordAssetPublicationAction(ctx, { asset: { kind: "collection", id }, actorId: identity.subject, action: "create", revision: 0, afterVisibility: "public", reason: "Created a course draft." });
    return id;
}
export const create = mutation({
  args: { title: v.optional(v.string()), language: v.optional(v.string()) },
  returns: v.id("learnCollections"),
  handler: (ctx, args) => createCourse(ctx, args),
});

const updateArgs = v.object({ courseId: v.id("learnCollections"), title: v.optional(v.string()), description: v.optional(v.string()), coverUrl: v.optional(v.union(v.string(), v.null())), coverY: v.optional(v.union(v.number(), v.null())), icon: v.optional(v.union(v.string(), v.null())), language: v.optional(v.string()), tags: v.optional(v.array(v.string())) });
export async function updateCourse(ctx: MutationCtx, args: Infer<typeof updateArgs>, asActor?: string) {
    const { row } = await ownedCourse(ctx, args.courseId, asActor);
    const m = { ...row.metadata };
    if (args.title !== undefined) { const t = args.title.trim(); if (!t || t.length > 200) throw new Error("VALIDATION_FAILED: Give the course a title of up to 200 characters."); m.title = t; }
    if (args.description !== undefined) { if (args.description.length > 4000) throw new Error("VALIDATION_FAILED: Keep the description under 4,000 characters."); m.description = args.description; }
    // Covers are an https link or a bundled gallery image (public/covers, lib/learn/covers.ts), as on lessons.
    if (args.coverUrl !== undefined) { if (args.coverUrl && !/^https:\/\/\S{1,2000}$/.test(args.coverUrl) && !/^\/covers\/[a-z0-9/_-]+\.(jpg|svg)$/.test(args.coverUrl)) throw new Error("VALIDATION_FAILED: Use an https image link or a gallery cover."); if (args.coverUrl) m.coverUrl = args.coverUrl; else { delete m.coverUrl; delete m.coverY; } }
    if (args.coverY !== undefined) { if (args.coverY === null) delete m.coverY; else if (Number.isFinite(args.coverY) && args.coverY >= 0 && args.coverY <= 100) m.coverY = Math.round(args.coverY); else throw new Error("VALIDATION_FAILED: Cover position is a percentage from 0 to 100."); }
    if (args.icon !== undefined) { if (!args.icon) delete m.icon; else if (args.icon.length <= 16 && !/[\s\u0000-\u001f\u007f<>]/.test(args.icon)) m.icon = args.icon; else throw new Error("VALIDATION_FAILED: Use a single emoji as the course icon."); }
    if (args.language !== undefined) m.language = args.language.slice(0, 35) || "en";
    if (args.tags !== undefined) m.tags = [...new Set(args.tags.map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
    await ctx.db.patch("learnCollections", row._id, { metadata: m, updatedAt: Date.now() });
    return null;
}
export const update = mutation({
  args: updateArgs.fields,
  returns: v.null(),
  handler: (ctx, args) => updateCourse(ctx, args),
});

/** Reorder or remove lessons. Only the owner's active lessons may be listed. */
const setOutlineArgs = v.object({ courseId: v.id("learnCollections"), lessonIds: v.array(v.id("lessons")) });
export async function setOutlineCourse(ctx: MutationCtx, args: Infer<typeof setOutlineArgs>, asActor?: string) {
    const { row, actor } = await ownedCourse(ctx, args.courseId, asActor);
    const ids = [...new Set(args.lessonIds)];
    if (ids.length > MAX_LESSONS) throw new Error(`VALIDATION_FAILED: A course holds up to ${MAX_LESSONS} lessons.`);
    for (const id of ids) { const l = await ctx.db.get("lessons", id); if (!l || l.ownerId !== actor) throw new Error("NOT_FOUND: Lesson not found."); }
    await ctx.db.patch("learnCollections", row._id, { lessonIds: ids, updatedAt: Date.now() });
    return null;
}
export const setOutline = mutation({
  args: setOutlineArgs.fields,
  returns: v.null(),
  handler: (ctx, args) => setOutlineCourse(ctx, args),
});

/** New blank lesson at the end of the course; opens straight in the editor. */
const addLessonArgs = v.object({ courseId: v.id("learnCollections"), title: v.optional(v.string()) });
export async function addLessonCourse(ctx: MutationCtx, args: Infer<typeof addLessonArgs>, asActor?: string) {
    const { row, actor } = await ownedCourse(ctx, args.courseId, asActor);
    const current = outline(row);
    if (current.length >= MAX_LESSONS) throw new Error(`VALIDATION_FAILED: A course holds up to ${MAX_LESSONS} lessons.`);
    const title = args.title?.trim().slice(0, 200) || `Lesson ${current.length + 1}`;
    const lessonId = await createLessonForActor(ctx, actor, { metadata: { title, description: "", language: row.metadata.language, tags: [], indexing: "index" } });
    await ctx.db.patch("learnCollections", row._id, { lessonIds: [...current, lessonId], updatedAt: Date.now() });
    return lessonId;
}
export const addLesson = mutation({
  args: addLessonArgs.fields,
  returns: v.id("lessons"),
  handler: (ctx, args) => addLessonCourse(ctx, args),
});

/**
 * Publish the course and every lesson in it with the course's visibility. Lessons with
 * unpublished changes are published first; problems come back per lesson.
 */
const publishArgs = v.object({ courseId: v.id("learnCollections"), visibility });
export async function publishCourse(ctx: MutationCtx, args: Infer<typeof publishArgs>, asActor?: string) {
    const { row, actor } = await ownedCourse(ctx, args.courseId, asActor);
    await requireVisibilityAllowed(ctx, actor, args.visibility);
    if (row.communityState !== "ok") throw new Error("MODERATED: This course is under review and can't be published right now.");
    const ids = outline(row);
    if (!ids.length) throw new Error("EMPTY: Add at least one lesson before publishing.");
    const items: Doc<"learnCollections">["items"] = [];
    const problems: { lessonId: Id<"lessons">; title: string; message: string }[] = [];
    for (const id of ids) {
      let lesson = await ctx.db.get("lessons", id);
      if (!lesson || lesson.ownerId !== actor) {
        // Never disclose metadata from a lesson the course owner no longer owns.
        problems.push({ lessonId: id, title: "Unavailable lesson", message: "Lesson is missing or no longer owned by you. Remove it from the course outline or replace it with an owned lesson." });
        continue;
      }
      if (lesson.status !== "active") {
        problems.push({ lessonId: id, title: lesson.metadata.title, message: "Lesson is archived. Reactivate it or remove it from the course outline before publishing." });
        continue;
      }
      if (lesson.communityState !== "ok") {
        problems.push({ lessonId: id, title: lesson.metadata.title, message: "Lesson is under moderation. Resolve its moderation state or remove it from the course outline before publishing." });
        continue;
      }
      const pub = lesson.publishedVersionId ? await ctx.db.get("lessonVersions", lesson.publishedVersionId) : null;
      const stale = !pub || lesson.visibility !== args.visibility || JSON.stringify(pub.document) !== JSON.stringify(lesson.draft) || JSON.stringify(pub.metadata) !== JSON.stringify(lesson.metadata);
      if (stale) {
        const result = await publishLessonForActor(ctx, actor, { lessonId: id, expectedRevision: lesson.revision, visibility: args.visibility, note: "Published with its course" });
        if (!result.ok) { problems.push({ lessonId: id, title: lesson.metadata.title, message: result.problems.map((p) => p.message).join(" ") }); continue; }
        lesson = (await ctx.db.get("lessons", id))!;
      }
      items.push({ kind: "lesson", id, versionId: lesson.publishedVersionId! });
    }
    if (problems.length) return { ok: false as const, problems };
    const last = await ctx.db.query("collectionVersions").withIndex("by_collectionId_and_number", (q) => q.eq("collectionId", row._id)).order("desc").first();
    const versionId = await ctx.db.insert("collectionVersions", { collectionId: row._id, number: (last?.number ?? 0) + 1, metadata: row.metadata, items, publishedAt: Date.now() });
    await ctx.db.patch("learnCollections", row._id, { items, publishedVersionId: versionId, visibility: args.visibility, revision: row.revision + 1, updatedAt: Date.now() });
    await enqueueLearnWebhookEvent(ctx, { event: "collection.published", collectionId: row._id, versionId, operationId: `publish:${versionId}`, revision: row.revision + 1 });
    await recordAssetPublicationAction(ctx, { asset: { kind: "collection", id: row._id }, actorId: actor, action: "publish", revision: row.revision + 1, versionId, beforeVisibility: row.visibility, afterVisibility: args.visibility, reason: "Published the course." });
    return { ok: true as const };
}
export const publish = mutation({
  args: publishArgs.fields,
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), problems: v.array(v.object({ lessonId: v.id("lessons"), title: v.string(), message: v.string() })) })),
  handler: (ctx, args) => publishCourse(ctx, args),
});

export async function unpublishCourse(ctx: MutationCtx, args: { courseId: Id<"learnCollections"> }, asActor?: string) {
    const { row, actor } = await ownedCourse(ctx, args.courseId, asActor);
    await ctx.db.patch("learnCollections", row._id, { publishedVersionId: undefined, revision: row.revision + 1, updatedAt: Date.now() });
    await recordAssetPublicationAction(ctx, { asset: { kind: "collection", id: row._id }, actorId: actor, action: "unpublish", revision: row.revision + 1, beforeVisibility: row.visibility, afterVisibility: row.visibility, reason: "Unpublished the course." });
    return null;
}
export const unpublish = mutation({
  args: { courseId: v.id("learnCollections") },
  returns: v.null(),
  handler: (ctx, args) => unpublishCourse(ctx, args),
});

/** Archive hides the course from the library and its public page; restore brings it back. Lessons are untouched. */
export async function setCourseArchived(ctx: MutationCtx, args: { courseId: Id<"learnCollections">; archived: boolean }, asActor?: string) {
    const { row } = await ownedCourse(ctx, args.courseId, asActor);
    await ctx.db.patch("learnCollections", row._id, { archived: args.archived, updatedAt: Date.now() });
    return null;
}
export const setArchived = mutation({
  args: { courseId: v.id("learnCollections"), archived: v.boolean() },
  returns: v.null(),
  handler: (ctx, args) => setCourseArchived(ctx, args),
});

const publicLesson = v.object({ id: v.id("lessons"), versionId: v.id("lessonVersions"), title: v.string(), description: v.string(), blocks: v.number() });

/** Anyone can read a published public course (owner and granted readers for private ones). */
export const getPublic = query({
  args: { courseId: v.string() },
  returns: v.union(v.null(), v.object({ id: v.id("learnCollections"), title: v.string(), description: v.string(), coverUrl: v.optional(v.string()), language: v.string(), tags: v.array(v.string()), ownerName: v.string(), ownerUsername: v.string(), publishedAt: v.number(), lessons: v.array(publicLesson) })),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("learnCollections", args.courseId);
    const row = id ? await ctx.db.get("learnCollections", id) : null;
    if (!row || !row.publishedVersionId || row.archived || row.communityState === "removed" || row.communityState === "hidden") return null;
    const identity = await ctx.auth.getUserIdentity();
    if (identity?.subject !== row.ownerId && (row.visibility !== "public" || row.communityState !== "ok")) return null;
    const owner = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", row.ownerId)).first();
    if (!owner || owner.isBanned || owner.suspendedUntil) return null;
    const version = await ctx.db.get("collectionVersions", row.publishedVersionId);
    if (!version || version.collectionId !== row._id) return null;
    const lessons = [];
    for (const item of version.items) {
      if (item.kind !== "lesson") continue;
      const lesson = await ctx.db.get("lessons", item.id);
      if (!lesson || lesson.status !== "active" || !lesson.publishedVersionId || await creatorRestricted(ctx, lesson.ownerId)) continue;
      const ownsLesson = identity?.subject === lesson.ownerId;
      if (!ownsLesson && (lesson.visibility !== "public" || lesson.communityState !== "ok")) continue;
      const lv = await ctx.db.get("lessonVersions", item.versionId);
      if (lv && lv.lessonId === item.id && (ownsLesson || lv.visibility === undefined || lv.visibility === "public")) lessons.push({ id: item.id, versionId: item.versionId, title: lv.metadata.title, description: lv.metadata.description, blocks: lv.document.blocks.length });
    }
    return { id: row._id, title: version.metadata.title, description: version.metadata.description, coverUrl: version.metadata.coverUrl, language: version.metadata.language, tags: version.metadata.tags, ownerName: owner.name, ownerUsername: owner.username, publishedAt: version.publishedAt, lessons };
  },
});

/** Public course catalogue for Explore and the sitemap, newest first. */
export const listPublic = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({ id: v.id("learnCollections"), title: v.string(), description: v.string(), coverUrl: v.optional(v.string()), language: v.string(), tags: v.array(v.string()), lessons: v.number(), updatedAt: v.number() })),
  handler: async (ctx, args) => {
    if (args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 100)) throw new Error("VALIDATION_FAILED: Limit must be an integer from 1 to 100.");
    const limit = args.limit ?? 24;
    const rows = await ctx.db.query("learnCollections").withIndex("by_visibility_and_updatedAt", (q) => q.eq("visibility", "public")).order("desc").take(limit * 3);
    const result = [];
    const restricted = new Map<string, boolean>();
    for (const row of rows) {
      if (!row.publishedVersionId || row.archived || row.communityState !== "ok") continue;
      if (!restricted.has(row.ownerId)) restricted.set(row.ownerId, await creatorRestricted(ctx, row.ownerId));
      if (restricted.get(row.ownerId)) continue;
      const version = await ctx.db.get("collectionVersions", row.publishedVersionId);
      if (!version || version.collectionId !== row._id) continue;
      result.push({ id: row._id, title: version.metadata.title, description: version.metadata.description, coverUrl: version.metadata.coverUrl, language: version.metadata.language, tags: version.metadata.tags, lessons: version.items.filter(item => item.kind === "lesson").length, updatedAt: version.publishedAt });
      if (result.length === limit) break;
    }
    return result;
  },
});
