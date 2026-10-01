import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser, isPaidPlan } from "./authz";
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

async function ownedCourse(ctx: QueryCtx | MutationCtx, courseId: Id<"learnCollections">) {
  const { identity, user } = await requireActiveUser(ctx);
  const row = await ctx.db.get("learnCollections", courseId);
  if (!row || row.ownerId !== identity.subject) throw new Error("NOT_FOUND: Course not found.");
  return { row, actor: identity.subject, user };
}
const outline = (row: Doc<"learnCollections">) => row.lessonIds ?? row.items.flatMap((i) => (i.kind === "lesson" ? [i.id] : []));

const courseCard = v.object({
  id: v.id("learnCollections"), title: v.string(), description: v.string(), coverUrl: v.optional(v.string()), lessons: v.number(),
  visibility, published: v.boolean(), updatedAt: v.number(), archived: v.boolean(),
});

export const listMine = query({
  args: {},
  returns: v.array(courseCard),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db.query("learnCollections").withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", identity.subject)).order("desc").take(200);
    return rows.map((r) => ({ id: r._id, title: r.metadata.title, description: r.metadata.description, coverUrl: r.metadata.coverUrl, lessons: outline(r).length, visibility: r.visibility, published: !!r.publishedVersionId, updatedAt: r.updatedAt, archived: !!r.archived }));
  },
});

const lessonRow = v.object({ id: v.id("lessons"), title: v.string(), description: v.string(), published: v.boolean(), changed: v.boolean(), blocks: v.number() });

/** Owner view for the course builder. */
export const get = query({
  args: { courseId: v.id("learnCollections") },
  returns: v.object({
    id: v.id("learnCollections"), title: v.string(), description: v.string(), coverUrl: v.optional(v.string()), language: v.string(), tags: v.array(v.string()),
    visibility, published: v.boolean(), publishedAt: v.union(v.number(), v.null()), canPrivate: v.boolean(), lessons: v.array(lessonRow), revision: v.number(),
  }),
  handler: async (ctx, args) => {
    const { row, user } = await ownedCourse(ctx, args.courseId);
    const version = row.publishedVersionId ? await ctx.db.get("collectionVersions", row.publishedVersionId) : null;
    const lessons = [];
    for (const id of outline(row)) {
      const lesson = await ctx.db.get("lessons", id);
      if (!lesson || lesson.status !== "active") continue;
      const pub = lesson.publishedVersionId ? await ctx.db.get("lessonVersions", lesson.publishedVersionId) : null;
      lessons.push({ id, title: lesson.metadata.title, description: lesson.metadata.description, published: !!pub, changed: !pub || JSON.stringify(pub.document) !== JSON.stringify(lesson.draft) || JSON.stringify(pub.metadata) !== JSON.stringify(lesson.metadata), blocks: lesson.draft.blocks.length });
    }
    return {
      id: row._id, title: row.metadata.title, description: row.metadata.description, coverUrl: row.metadata.coverUrl, language: row.metadata.language, tags: row.metadata.tags,
      visibility: row.visibility, published: !!row.publishedVersionId, publishedAt: version?.publishedAt ?? null, canPrivate: isPaidPlan(user ?? null, Date.now()), lessons, revision: row.revision,
    };
  },
});

export const create = mutation({
  args: { title: v.optional(v.string()), language: v.optional(v.string()) },
  returns: v.id("learnCollections"),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const title = (args.title ?? "").trim().slice(0, 200) || "Untitled course";
    const now = Date.now();
    const id = await ctx.db.insert("learnCollections", { ownerId: identity.subject, metadata: { title, description: "", language: args.language?.slice(0, 35) || "en", tags: [] }, items: [], lessonIds: [], revision: 0, visibility: "public", communityState: "ok", createdAt: now, updatedAt: now });
    await recordAssetPublicationAction(ctx, { asset: { kind: "collection", id }, actorId: identity.subject, action: "create", revision: 0, afterVisibility: "public", reason: "Created a course draft." });
    return id;
  },
});

export const update = mutation({
  args: { courseId: v.id("learnCollections"), title: v.optional(v.string()), description: v.optional(v.string()), coverUrl: v.optional(v.union(v.string(), v.null())), language: v.optional(v.string()), tags: v.optional(v.array(v.string())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { row } = await ownedCourse(ctx, args.courseId);
    const m = { ...row.metadata };
    if (args.title !== undefined) { const t = args.title.trim(); if (!t || t.length > 200) throw new Error("VALIDATION_FAILED: Give the course a title of up to 200 characters."); m.title = t; }
    if (args.description !== undefined) { if (args.description.length > 4000) throw new Error("VALIDATION_FAILED: Keep the description under 4,000 characters."); m.description = args.description; }
    if (args.coverUrl !== undefined) { if (args.coverUrl && !/^https:\/\/\S{1,2000}$/.test(args.coverUrl)) throw new Error("VALIDATION_FAILED: Use an https image link."); if (args.coverUrl) m.coverUrl = args.coverUrl; else delete m.coverUrl; }
    if (args.language !== undefined) m.language = args.language.slice(0, 35) || "en";
    if (args.tags !== undefined) m.tags = [...new Set(args.tags.map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
    await ctx.db.patch("learnCollections", row._id, { metadata: m, updatedAt: Date.now() });
    return null;
  },
});

/** Reorder or remove lessons. Only the owner's active lessons may be listed. */
export const setOutline = mutation({
  args: { courseId: v.id("learnCollections"), lessonIds: v.array(v.id("lessons")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { row, actor } = await ownedCourse(ctx, args.courseId);
    const ids = [...new Set(args.lessonIds)];
    if (ids.length > MAX_LESSONS) throw new Error(`VALIDATION_FAILED: A course holds up to ${MAX_LESSONS} lessons.`);
    for (const id of ids) { const l = await ctx.db.get("lessons", id); if (!l || l.ownerId !== actor) throw new Error("NOT_FOUND: Lesson not found."); }
    await ctx.db.patch("learnCollections", row._id, { lessonIds: ids, updatedAt: Date.now() });
    return null;
  },
});

/** New blank lesson at the end of the course; opens straight in the editor. */
export const addLesson = mutation({
  args: { courseId: v.id("learnCollections"), title: v.optional(v.string()) },
  returns: v.id("lessons"),
  handler: async (ctx, args) => {
    const { row, actor } = await ownedCourse(ctx, args.courseId);
    const current = outline(row);
    if (current.length >= MAX_LESSONS) throw new Error(`VALIDATION_FAILED: A course holds up to ${MAX_LESSONS} lessons.`);
    const title = args.title?.trim().slice(0, 200) || `Lesson ${current.length + 1}`;
    const lessonId = await createLessonForActor(ctx, actor, { metadata: { title, description: "", language: row.metadata.language, tags: [], indexing: "index" } });
    await ctx.db.patch("learnCollections", row._id, { lessonIds: [...current, lessonId], updatedAt: Date.now() });
    return lessonId;
  },
});

/**
 * Publish the course and every lesson in it with the course's visibility. Lessons with
 * unpublished changes are published first; problems come back per lesson.
 */
export const publish = mutation({
  args: { courseId: v.id("learnCollections"), visibility },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), problems: v.array(v.object({ lessonId: v.id("lessons"), title: v.string(), message: v.string() })) })),
  handler: async (ctx, args) => {
    const { row, actor } = await ownedCourse(ctx, args.courseId);
    await requireVisibilityAllowed(ctx, actor, args.visibility);
    if (row.communityState !== "ok") throw new Error("MODERATED: This course is under review and can't be published right now.");
    const ids = outline(row);
    if (!ids.length) throw new Error("EMPTY: Add at least one lesson before publishing.");
    const items: Doc<"learnCollections">["items"] = [];
    const problems: { lessonId: Id<"lessons">; title: string; message: string }[] = [];
    for (const id of ids) {
      let lesson = await ctx.db.get("lessons", id);
      if (!lesson || lesson.ownerId !== actor || lesson.status !== "active") continue;
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
  },
});

export const unpublish = mutation({
  args: { courseId: v.id("learnCollections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { row, actor } = await ownedCourse(ctx, args.courseId);
    await ctx.db.patch("learnCollections", row._id, { publishedVersionId: undefined, revision: row.revision + 1, updatedAt: Date.now() });
    await recordAssetPublicationAction(ctx, { asset: { kind: "collection", id: row._id }, actorId: actor, action: "unpublish", revision: row.revision + 1, beforeVisibility: row.visibility, afterVisibility: row.visibility, reason: "Unpublished the course." });
    return null;
  },
});

export const setArchived = mutation({
  args: { courseId: v.id("learnCollections"), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { row } = await ownedCourse(ctx, args.courseId);
    await ctx.db.patch("learnCollections", row._id, { archived: args.archived, updatedAt: Date.now() });
    return null;
  },
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
    if (row.visibility !== "public" && identity?.subject !== row.ownerId) return null;
    const owner = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", row.ownerId)).first();
    if (!owner || owner.isBanned || owner.suspendedUntil) return null;
    const version = (await ctx.db.get("collectionVersions", row.publishedVersionId))!;
    const lessons = [];
    for (const item of version.items) {
      if (item.kind !== "lesson") continue;
      const lv = await ctx.db.get("lessonVersions", item.versionId);
      if (lv) lessons.push({ id: item.id, versionId: item.versionId, title: lv.metadata.title, description: lv.metadata.description, blocks: lv.document.blocks.length });
    }
    return { id: row._id, title: version.metadata.title, description: version.metadata.description, coverUrl: version.metadata.coverUrl, language: version.metadata.language, tags: version.metadata.tags, ownerName: owner.name, ownerUsername: owner.username, publishedAt: version.publishedAt, lessons };
  },
});

/** Public course catalogue for Explore and the sitemap, newest first. */
export const listPublic = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({ id: v.id("learnCollections"), title: v.string(), description: v.string(), coverUrl: v.optional(v.string()), lessons: v.number(), updatedAt: v.number() })),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 24), 1), 100);
    const rows = await ctx.db.query("learnCollections").withIndex("by_visibility_and_updatedAt", (q) => q.eq("visibility", "public")).order("desc").take(limit * 3);
    return rows.filter((r) => r.publishedVersionId && !r.archived && r.communityState === "ok").slice(0, limit)
      .map((r) => ({ id: r._id, title: r.metadata.title, description: r.metadata.description, coverUrl: r.metadata.coverUrl, lessons: r.items.length, updatedAt: r.updatedAt }));
  },
});
