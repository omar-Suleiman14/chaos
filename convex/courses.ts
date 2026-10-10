import { publicCourseMetadata } from "./publicCourseMetadata";
import { courseModule, courseDetails } from "./learnAssetModel";
import { randomCover } from "../lib/learn/covers";
import { canonicalCommunityActor } from "./learnCommunityIntegrations";
import { getAuthIdentity } from "./authIdentity";
import { authorDb } from "./authorIndex";
import { courseSearchText } from "./courseSearchModel";
import { v, type Infer } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser, isPaidPlan, creatorRestricted } from "./authz";
import { coursesContainingLesson, createLessonForActor, publishLessonForActor } from "./lessons";
import { requireVisibilityAllowed } from "./plans";
import { canEditTeamAsset, hasBusinessWorkspace, resolveAudienceTeam, teamAudienceAllows } from "./businessAccess";
import { visibility } from "./learnModel";
import { recordAssetPublicationAction } from "./learnPublicationAudit";
import { enqueueLearnWebhookEvent } from "./learnWebhookEvents";
import { pendingCourseChanges } from "./courseStructure";
import { hasLiveCoursePublication } from "./publicationEligibility";
import { memoizeRead } from "./readMemo";

/**
 * Courses are created like forms: a titled, ordered set of lessons that is published as
 * one thing. Stored as a learnCollection: `lessonIds` is the draft outline, `items` the
 * published snapshot. Public courses are free for everyone; private ones need Business.
 */
const MAX_LESSONS = 100;
export const pendingCourseChange = v.union(v.literal("details"), v.literal("structure"));

/** Signed-in caller, or a server-verified actor (ChatGPT app) when `actor` is given. */
async function ownedCourse(ctx: QueryCtx | MutationCtx, courseId: Id<"learnCollections">, asActor?: string, allowEditor = false) {
  let subject = asActor, user: Doc<"users"> | null;
  if (subject === undefined) { const r = await requireActiveUser(ctx); subject = r.identity.subject; user = r.user ?? null; }
  else user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", subject!)).first();
  const row = await ctx.db.get("learnCollections", courseId);
  if (!row || (row.ownerId !== subject && (!allowEditor || row.communityState === "removed" || await creatorRestricted(ctx, row.ownerId) || !await canEditTeamAsset(ctx, subject, { kind: "course", id: row._id })))) throw new Error("NOT_FOUND: Course not found.");
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
    const identity = await getAuthIdentity(ctx);
    if (!identity) return [];
    const rows = await ctx.db.query("learnCollections").withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", identity.subject)).order("desc").take(200);
    return rows.map(toCourseCard);
  },
});

const lessonRow = v.object({ id: v.id("lessons"), title: v.string(), description: v.string(), published: v.boolean(), changed: v.boolean(), blocks: v.number() });

/** Owner view for the course builder. */
const getArgs = v.object({ courseId: v.id("learnCollections") });
export async function getCourse(ctx: QueryCtx, args: Infer<typeof getArgs>, asActor?: string) {
    const { row, user, actor } = await ownedCourse(ctx, args.courseId, asActor, true);
    const version = row.publishedVersionId ? await ctx.db.get("collectionVersions", row.publishedVersionId) : null;
    const lessons: Infer<typeof lessonRow>[] = [];
    const publishedLessons = new Set<Id<"lessons">>();
    for (const id of outline(row)) {
      const lesson = await ctx.db.get("lessons", id);
      if (!lesson || lesson.status !== "active") continue;
      const pub = lesson.publishedVersionId ? await ctx.db.get("lessonVersions", lesson.publishedVersionId) : null;
      if (pub) publishedLessons.add(id);
      lessons.push({ id, title: lesson.metadata.title, description: lesson.metadata.description, published: !!pub, changed: !pub || JSON.stringify(pub.document) !== JSON.stringify(lesson.draft) || JSON.stringify(pub.metadata) !== JSON.stringify(lesson.metadata), blocks: lesson.draft.blocks.length });
    }
    return {
      id: row._id, title: row.metadata.title, description: row.metadata.description, coverUrl: row.metadata.coverUrl, coverY: row.metadata.coverY, icon: row.metadata.icon, language: row.metadata.language, tags: row.metadata.tags,
      visibility: row.visibility, published: !!row.publishedVersionId, publishedAt: version?.publishedAt ?? null, isOwner: row.ownerId === actor, ...(row.visibility === "restricted" && row.audienceTeamId ? { teamId: row.audienceTeamId } : {}), canPrivate: isPaidPlan(user ?? null, Date.now()) || await hasBusinessWorkspace(ctx, row.ownerId), modules: row.modules ?? [], details: row.details, lessons, revision: row.revision,
      pendingChanges: pendingCourseChanges(row, version, publishedLessons),
    };
}
export const get = query({
  args: getArgs.fields,
  returns: v.object({
    id: v.id("learnCollections"), title: v.string(), description: v.string(), coverUrl: v.optional(v.string()), coverY: v.optional(v.number()), icon: v.optional(v.string()), language: v.string(), tags: v.array(v.string()),
    visibility, published: v.boolean(), publishedAt: v.union(v.number(), v.null()), isOwner: v.boolean(), teamId: v.optional(v.id("businessTeams")), canPrivate: v.boolean(), modules: v.array(courseModule), details: v.optional(courseDetails), lessons: v.array(lessonRow), revision: v.number(),
    /** Draft changes readers don't see yet; publishing the course releases them (convex/courseStructure.ts). */
    pendingChanges: v.array(pendingCourseChange),
  }),
  handler: (ctx, args) => getCourse(ctx, args),
});

export async function createCourse(ctx: MutationCtx, args: { title?: string; language?: string }, actor?: string) {
    const identity = { subject: actor ?? (await requireActiveUser(ctx)).identity.subject };
    const title = (args.title ?? "").trim().slice(0, 200) || "Untitled course";
    const now = Date.now();
    const id = await authorDb(ctx).insert("learnCollections", { ownerId: identity.subject, metadata: { title, description: "", language: args.language?.slice(0, 35) || "en", tags: [], coverUrl: randomCover() }, items: [], lessonIds: [], revision: 0, visibility: "public", communityState: "ok", createdAt: now, updatedAt: now });
    await recordAssetPublicationAction(ctx, { asset: { kind: "collection", id }, actorId: identity.subject, action: "create", revision: 0, afterVisibility: "public", reason: "Created a course draft." });
    return id;
}
export const create = mutation({
  args: { title: v.optional(v.string()), language: v.optional(v.string()) },
  returns: v.id("learnCollections"),
  handler: (ctx, args) => createCourse(ctx, args),
});

const updateArgs = v.object({ courseId: v.id("learnCollections"), title: v.optional(v.string()), description: v.optional(v.string()), coverUrl: v.optional(v.union(v.string(), v.null())), coverY: v.optional(v.union(v.number(), v.null())), icon: v.optional(v.union(v.string(), v.null())), language: v.optional(v.string()), tags: v.optional(v.array(v.string())), details: v.optional(courseDetails) });
export async function updateCourse(ctx: MutationCtx, args: Infer<typeof updateArgs>, asActor?: string) {
    const { row } = await ownedCourse(ctx, args.courseId, asActor, true);
    const m = { ...row.metadata };
    if (args.title !== undefined) { const t = args.title.trim(); if (!t || t.length > 200) throw new Error("VALIDATION_FAILED: Give the course a title of up to 200 characters."); m.title = t; }
    if (args.description !== undefined) { if (args.description.length > 4000) throw new Error("VALIDATION_FAILED: Keep the description under 4,000 characters."); m.description = args.description; }
    // Covers are an https link or a bundled gallery image (public/covers, lib/learn/covers.ts), as on lessons.
    if (args.coverUrl !== undefined) { if (args.coverUrl && !/^https:\/\/\S{1,2000}$/.test(args.coverUrl) && !/^\/covers\/[a-z0-9/_-]+\.(jpg|svg)$/.test(args.coverUrl)) throw new Error("VALIDATION_FAILED: Use an https image link or a gallery cover."); if (args.coverUrl) m.coverUrl = args.coverUrl; else { delete m.coverUrl; delete m.coverY; } }
    if (args.coverY !== undefined) { if (args.coverY === null) delete m.coverY; else if (Number.isFinite(args.coverY) && args.coverY >= 0 && args.coverY <= 100) m.coverY = Math.round(args.coverY); else throw new Error("VALIDATION_FAILED: Cover position is a percentage from 0 to 100."); }
    // oxlint-disable-next-line eslint/no-control-regex -- Control characters are deliberately matched to sanitise untrusted text and URLs.
    if (args.icon !== undefined) { if (!args.icon) delete m.icon; else if (args.icon.length <= 40 && !/[\s\u0000-\u001f\u007f<>]/.test(args.icon)) m.icon = args.icon; else throw new Error("VALIDATION_FAILED: Use a valid Lucide icon name or emoji as the course icon."); }
    if (args.language !== undefined) m.language = args.language.slice(0, 35) || "en";
    if (args.tags !== undefined) m.tags = [...new Set(args.tags.map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
    if (args.details && (args.details.outcomes.length > 20 || args.details.outcomes.some(o => !o.trim() || o.length > 500) || (args.details.estimatedMinutes !== undefined && (!Number.isFinite(args.details.estimatedMinutes) || args.details.estimatedMinutes <= 0 || args.details.estimatedMinutes > 10000)))) throw new Error("VALIDATION_FAILED: Use up to 20 clear outcomes and a duration from 1 to 10000 minutes.");
    await authorDb(ctx).patch("learnCollections", row._id, { metadata: m, ...(args.details ? { details: args.details } : {}), updatedAt: Date.now() });
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
    const { row, actor } = await ownedCourse(ctx, args.courseId, asActor, true);
    const ids = [...new Set(args.lessonIds)];
    if (ids.length > MAX_LESSONS) throw new Error(`VALIDATION_FAILED: A course holds up to ${MAX_LESSONS} lessons.`);
    for (const id of ids) { const l = await ctx.db.get("lessons", id); if (!l || l.ownerId !== row.ownerId) throw new Error("NOT_FOUND: Lesson not found."); }
    if (actor !== row.ownerId && ids.some(id => !outline(row).includes(id))) throw new Error("Only the owner can add existing lessons to this course.");
    await authorDb(ctx).patch("learnCollections", row._id, { lessonIds: ids, modules: row.modules?.map(m => ({ ...m, lessonIds: ids.filter(id => m.lessonIds.includes(id)) })), updatedAt: Date.now() });
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
    const { row } = await ownedCourse(ctx, args.courseId, asActor, true);
    const current = outline(row);
    if (current.length >= MAX_LESSONS) throw new Error(`VALIDATION_FAILED: A course holds up to ${MAX_LESSONS} lessons.`);
    const title = args.title?.trim().slice(0, 200) || `Lesson ${current.length + 1}`;
    const lessonId = await createLessonForActor(ctx, row.ownerId, { metadata: { title, description: "", language: row.metadata.language, tags: [], indexing: "index" } });
    await authorDb(ctx).patch("learnCollections", row._id, { lessonIds: [...current, lessonId], updatedAt: Date.now() });
    return lessonId;
}
/** Check the caller owns an active course with room for a lesson; for imports, before any lesson is created. */
export async function courseForImport(ctx: MutationCtx, courseId: Id<"learnCollections">, moduleId?: string) {
  const { row, actor } = await ownedCourse(ctx, courseId);
  if (row.ownerId !== actor) throw new Error("NOT_FOUND: Course not found.");
  if (row.archived) throw new Error("COURSE_ARCHIVED: Restore this course before adding lessons.");
  if (moduleId && !row.modules?.some((m) => m.id === moduleId)) throw new Error("NOT_FOUND: Module not found.");
  return row;
}

/** Put an existing lesson of the course owner at the end of the course (and of a module), once. */
export async function attachLessonToCourse(ctx: MutationCtx, row: Doc<"learnCollections">, lessonId: Id<"lessons">, moduleId?: string) {
  const current = outline(row);
  const inCourse = current.includes(lessonId);
  if (!inCourse && current.length >= MAX_LESSONS) throw new Error(`VALIDATION_FAILED: A course holds up to ${MAX_LESSONS} lessons.`);
  const modules = moduleId ? row.modules?.map((m) => ({ ...m, lessonIds: m.id === moduleId ? [...m.lessonIds.filter((id) => id !== lessonId), lessonId] : m.lessonIds.filter((id) => id !== lessonId) })) : row.modules;
  await authorDb(ctx).patch("learnCollections", row._id, { lessonIds: inCourse ? current : [...current, lessonId], ...(moduleId ? { modules } : {}), updatedAt: Date.now() });
}

export const addLesson = mutation({
  args: addLessonArgs.fields,
  returns: v.id("lessons"),
  handler: (ctx, args) => addLessonCourse(ctx, args),
});

/**
 * Publish the course and every lesson in it with the course's visibility, as one action.
 * Lessons with unpublished changes are published first; problems come back per lesson.
 */
const publishArgs = v.object({ courseId: v.id("learnCollections"), visibility, teamId: v.optional(v.id("businessTeams")) });
export async function publishCourse(ctx: MutationCtx, args: Infer<typeof publishArgs>, asActor?: string) {
    const { row, actor } = await ownedCourse(ctx, args.courseId, asActor);
    if (row.archived) throw new Error("COURSE_ARCHIVED: Restore this course before publishing.");
    await requireVisibilityAllowed(ctx, actor, args.visibility);
    const audienceTeamId = await resolveAudienceTeam(ctx, actor, args.visibility, args.teamId, row.audienceTeamId);
    if (row.communityState !== "ok") throw new Error("MODERATED: This course is under review and can't be published right now.");
    for (const courseModuleItem of row.modules ?? []) for (const asset of courseModuleItem.assessments) {
      const id = asset.kind === "form" ? ctx.db.normalizeId("forms", asset.id) : null; const form = id ? await ctx.db.get("forms", id) : null;
      if (!form || form.ownerId !== actor || form.status !== "live" || form.isBanned || form.publishedVersion === undefined) throw new Error("ASSESSMENT_UNPUBLISHED: Publish each module quiz before publishing this course.");
    }
    const ids = outline(row);
    if (!ids.length) throw new Error("EMPTY: Add at least one lesson before publishing.");
    const items: Doc<"learnCollections">["items"] = [];
    const problems: { lessonId: Id<"lessons">; title: string; message: string }[] = [];
    for (const id of ids) {
      const lesson = await ctx.db.get("lessons", id);
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
      let pub = lesson.publishedVersionId ? await ctx.db.get("lessonVersions", lesson.publishedVersionId) : null;
      const changed = !pub || pub.lessonId !== id || JSON.stringify(pub.document) !== JSON.stringify(lesson.draft) || JSON.stringify(pub.metadata) !== JSON.stringify(lesson.metadata);
      const wrongVisibility = !!pub && (lesson.visibility !== args.visibility || (pub.visibility ?? "public") !== args.visibility || lesson.audienceTeamId !== audienceTeamId);
      if (changed || wrongVisibility) {
        const result = await publishLessonForActor(ctx, actor, { lessonId: id, expectedRevision: lesson.revision, visibility: args.visibility, teamId: audienceTeamId }, true);
        if (!result.ok) { problems.push({ lessonId: id, title: lesson.metadata.title, message: result.problems.map(p => p.message).join(" ") }); continue; }
        pub = await ctx.db.get("lessonVersions", result.versionId);
      }
      items.push({ kind: "lesson", id, versionId: pub!._id });
    }
    if (problems.length) return { ok: false as const, problems };
    const last = await ctx.db.query("collectionVersions").withIndex("by_collectionId_and_number", (q) => q.eq("collectionId", row._id)).order("desc").first();
    const versionId = await ctx.db.insert("collectionVersions", { collectionId: row._id, number: (last?.number ?? 0) + 1, metadata: row.metadata, modules: row.modules, details: row.details, items, publishedAt: Date.now() });
    await authorDb(ctx).patch("learnCollections", row._id, { items, searchText: await courseSearchText(ctx, row.ownerId, row.metadata, items), publishedVersionId: versionId, visibility: args.visibility, audienceTeamId, revision: row.revision + 1, updatedAt: Date.now() });
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
    await authorDb(ctx).patch("learnCollections", row._id, { publishedVersionId: undefined, revision: row.revision + 1, updatedAt: Date.now() });
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
    await authorDb(ctx).patch("learnCollections", row._id, { archived: args.archived, updatedAt: Date.now() });
    return null;
}
export const setArchived = mutation({
  args: { courseId: v.id("learnCollections"), archived: v.boolean() },
  returns: v.null(),
  handler: (ctx, args) => setCourseArchived(ctx, args),
});

const publicLesson = v.object({ id: v.id("lessons"), versionId: v.id("lessonVersions"), title: v.string(), description: v.string(), blocks: v.number() });

/** Anyone can read a published public course (owner and granted readers for private ones). */
export async function readPublicCourse(ctx: QueryCtx, args: { courseId: string }, asActor?: string) {
    const id = ctx.db.normalizeId("learnCollections", args.courseId);
    const row = id ? await ctx.db.get("learnCollections", id) : null;
    if (!row || !row.publishedVersionId || row.archived || row.communityState === "removed" || row.communityState === "hidden") return null;
    const identity = asActor ? { subject: asActor } : await getAuthIdentity(ctx);
    if (identity?.subject !== row.ownerId && ((row.visibility !== "public" && !await teamAudienceAllows(ctx, row, identity?.subject)) || row.communityState !== "ok")) return null;
    const owner = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", row.ownerId)).first();
    if (!owner || owner.isBanned || owner.suspendedUntil) return null;
    const version = await ctx.db.get("collectionVersions", row.publishedVersionId);
    if (!version || version.collectionId !== row._id) return null;
    const lessons: { id: Id<"lessons">; versionId: Id<"lessonVersions">; title: string; description: string; blocks: number }[] = [];
    for (const item of version.items) {
      if (item.kind !== "lesson") continue;
      const lesson = await ctx.db.get("lessons", item.id);
      if (!lesson || lesson.status !== "active" || !lesson.publishedVersionId || await creatorRestricted(ctx, lesson.ownerId)) continue;
      const ownsLesson = identity?.subject === lesson.ownerId, team = await teamAudienceAllows(ctx, lesson, identity?.subject);
      if (!ownsLesson && ((lesson.visibility !== "public" && !team) || lesson.communityState !== "ok")) continue;
      const lv = await ctx.db.get("lessonVersions", item.versionId);
      if (lv && lv.lessonId === item.id && (ownsLesson || team || lv.visibility === undefined || lv.visibility === "public")) lessons.push({ id: item.id, versionId: item.versionId, title: lv.metadata.title, description: lv.metadata.description, blocks: lv.document.blocks.length });
    }
    return { id: row._id, title: version.metadata.title, description: version.metadata.description, coverUrl: version.metadata.coverUrl, icon: version.metadata.icon, language: version.metadata.language, tags: version.metadata.tags, details: version.details, modules: (version.modules ?? []).map(m => ({ ...m, lessonIds: m.lessonIds.filter(id => lessons.some(l => l.id === id)) })), ownerName: owner.name, ownerUsername: owner.username, publishedAt: version.publishedAt, lessons };
}
export const getPublic = query({
  args: { courseId: v.string() },
  returns: v.union(v.null(), v.object({ id: v.id("learnCollections"), title: v.string(), description: v.string(), coverUrl: v.optional(v.string()), icon: v.optional(v.string()), language: v.string(), tags: v.array(v.string()), details: v.optional(courseDetails), modules: v.array(courseModule), ownerName: v.string(), ownerUsername: v.string(), publishedAt: v.number(), lessons: v.array(publicLesson) })),
  handler: (ctx, args) => readPublicCourse(ctx, args),
});

/** Every public, published course for the sitemap, a bounded page at a time; follow continueCursor until isDone. */
export const listIndexable = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ id: v.id("learnCollections"), updatedAt: v.number() })),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) throw new Error("VALIDATION_FAILED: Page size must be 1–100.");
    const result = await ctx.db.query("learnCollections").withIndex("by_visibility_and_updatedAt", (q) => q.eq("visibility", "public")).order("desc").paginate(args.paginationOpts);
    const page = [];
    const restricted = new Map<string, boolean>();
    for (const row of result.page) {
      if (!hasLiveCoursePublication(row)) continue;
      if (!restricted.has(row.ownerId)) restricted.set(row.ownerId, await creatorRestricted(ctx, row.ownerId));
      if (restricted.get(row.ownerId)) continue;
      const version = await ctx.db.get("collectionVersions", row.publishedVersionId);
      if (!version || version.collectionId !== row._id) continue;
      page.push({ id: row._id, updatedAt: version.publishedAt });
    }
    return { ...result, page };
  },
});

/** Legacy array snapshot retained for existing callers. Explore uses courseDirectory.browse pagination. */
export const listPublic = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({
    id: v.id("learnCollections"),
    title: v.string(),
    description: v.string(),
    coverUrl: v.optional(v.string()),
    icon: v.optional(v.string()),
    language: v.string(),
    tags: v.array(v.string()),
    lessons: v.number(),
    lessonIds: v.array(v.id("lessons")),
    lessonTitles: v.array(v.string()),
    ownerName: v.string(),
    ownerUsername: v.string(),
    updatedAt: v.number(),
  })),
  handler: async (ctx, args) => {
    if (args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 100)) throw new Error("VALIDATION_FAILED: Limit must be an integer from 1 to 100.");
    const limit = args.limit ?? 24;
    const rows = await ctx.db.query("learnCollections").withIndex("by_visibility_and_updatedAt", (q) => q.eq("visibility", "public")).order("desc").take(limit * 3);
    const result = [];
    const restricted = new Map<string, boolean>();
    const ownerById = memoizeRead((ownerId: string) =>
      ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", ownerId)).first(),
    );
    for (const row of rows) {
      if (!hasLiveCoursePublication(row)) continue;
      if (!restricted.has(row.ownerId)) restricted.set(row.ownerId, await creatorRestricted(ctx, row.ownerId));
      if (restricted.get(row.ownerId)) continue;
      const version = await ctx.db.get("collectionVersions", row.publishedVersionId);
      if (!version || version.collectionId !== row._id) continue;
      const owner = await ownerById(row.ownerId);
      const lessonItems = version.items.filter((item) => item.kind === "lesson");
      const lessonIds = lessonItems.map((item) => item.id as Id<"lessons">);
      const lessonTitles: string[] = [];
      for (const item of lessonItems) {
        const lv = await ctx.db.get("lessonVersions", item.versionId);
        if (lv) lessonTitles.push(lv.metadata.title);
      }
      result.push({
        id: row._id,
        ...publicCourseMetadata(version.metadata),
        lessons: lessonItems.length,
        lessonIds,
        lessonTitles,
        ownerName: owner?.name ?? "Chaos creator",
        ownerUsername: owner?.username ?? "",
        updatedAt: version.publishedAt,
      });
      if (result.length === limit) break;
    }
    return result;
  },
});

export async function setCourseModules(ctx: MutationCtx, args: { courseId: Id<"learnCollections">; modules: Infer<typeof courseModule>[] }, asActor?: string) {
  const { row, actor: editor } = await ownedCourse(ctx, args.courseId, asActor, true);
  const actor = row.ownerId;
  if (args.modules.length > 30) throw new Error("VALIDATION_FAILED: A course supports up to 30 modules.");
  const moduleIds = new Set<string>(), seen = new Set<string>(), current = outline(row);
  for (const courseModuleItem of args.modules) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(courseModuleItem.id) || moduleIds.has(courseModuleItem.id) || !courseModuleItem.title.trim() || courseModuleItem.title.length > 200 || courseModuleItem.assessments.length > 20) throw new Error("VALIDATION_FAILED: Invalid or duplicate module.");
    moduleIds.add(courseModuleItem.id);
    for (const id of courseModuleItem.lessonIds) { if (seen.has(id) || !current.includes(id)) throw new Error("VALIDATION_FAILED: Each outlined lesson belongs to at most one module."); seen.add(id); }
    for (const asset of courseModuleItem.assessments) {
      if (editor !== row.ownerId && !(row.modules ?? []).some(module => module.assessments.some(existing => existing.kind === asset.kind && existing.id === asset.id))) throw new Error("Only the owner can add assessments to this course.");
      const id = asset.kind === "form" ? ctx.db.normalizeId("forms", asset.id) : null;
      if (!id) throw new Error("NOT_FOUND: Assessment not found.");
      const form = await ctx.db.get("forms", id);
      if (!form || form.ownerId !== actor || !form.draft.quiz?.enabled) throw new Error("NOT_FOUND: Quiz not owned by you.");
    }
  }
  await authorDb(ctx).patch("learnCollections", row._id, { modules: args.modules.map(m => ({ ...m, title: m.title.trim() })), lessonIds: [...args.modules.flatMap(m => m.lessonIds), ...current.filter(id => !seen.has(id))], updatedAt: Date.now() });
  return null;
}
export const setModules = mutation({ args: { courseId: v.id("learnCollections"), modules: v.array(courseModule) }, returns: v.null(), handler: (ctx, args) => setCourseModules(ctx, args) });
export async function readCourseProgress(ctx: QueryCtx, args: { courseId: string }, asActor?: string) {
  const identity = asActor ? { subject: asActor } : await getAuthIdentity(ctx);
  if (!identity) return [];
  const course = await readPublicCourse(ctx, args, identity.subject);
  if (!course) return [];
  const actor = await canonicalCommunityActor(ctx, identity.subject);
  const result = [];
  for (const lesson of course.lessons) {
    const row = await ctx.db.query("learnProgress").withIndex("by_userKey_and_lessonId_and_key", q => q.eq("userKey", actor.tokenIdentifier).eq("lessonId", lesson.id).eq("key", `v:${lesson.versionId}`)).unique();
    const count = row?.completedBlocks.length ?? 0;
    result.push({ lessonId: lesson.id, completed: row?.completionAcknowledged === true || (row?.completionAcknowledged === undefined && lesson.blocks > 0 && count >= lesson.blocks), percent: lesson.blocks ? Math.min(100, Math.round(count / lesson.blocks * 100)) : 0 });
  }
  return result;
}
export const myProgress = query({ args: { courseId: v.string() }, returns: v.array(v.object({ lessonId: v.id("lessons"), completed: v.boolean(), percent: v.number() })), handler: (ctx, args) => readCourseProgress(ctx, args) });

export async function rememberCourse(ctx: MutationCtx, args: { courseId: string }, asActor?: string) {
  const identity = asActor ? { subject: asActor } : await getAuthIdentity(ctx);
  if (!identity) throw new Error("UNAUTHENTICATED");
  // MCP callers were already checked by requireLearnActor; native callers are checked here.
  if (!asActor) await requireActiveUser(ctx);
  const course = await readPublicCourse(ctx, args, identity.subject);
  if (!course) throw new Error("NOT_FOUND: Course unavailable.");
  const actor = await canonicalCommunityActor(ctx, identity.subject);
  const row = await ctx.db.query("learnCourseActivity").withIndex("by_userKey_and_courseId", q => q.eq("userKey", actor.tokenIdentifier).eq("courseId", course.id)).unique();
  if (row) await ctx.db.patch("learnCourseActivity", row._id, { updatedAt: Date.now() });
  else await ctx.db.insert("learnCourseActivity", { userKey: actor.tokenIdentifier, courseId: course.id, updatedAt: Date.now() });
  return null;
}
export const remember = mutation({ args: { courseId: v.string() }, returns: v.null(), handler: (ctx, args) => rememberCourse(ctx, args) });
export const myLearning = query({ args: {}, handler: async ctx => {
  const identity = await getAuthIdentity(ctx);
  if (!identity) return [];
  const actor = await canonicalCommunityActor(ctx, identity.subject);
  const rows = await ctx.db.query("learnCourseActivity").withIndex("by_userKey_and_updatedAt", q => q.eq("userKey", actor.tokenIdentifier)).order("desc").take(20);
  const results = [];
  for (const row of rows) {
    const course = await readPublicCourse(ctx, { courseId: row.courseId }, identity.subject);
    if (!course) continue;
    const progress = await readCourseProgress(ctx, { courseId: course.id }, identity.subject);
    const target = course.lessons.find(l => progress.some(p => p.lessonId === l.id && !p.completed && p.percent > 0)) ?? course.lessons.find(l => !progress.some(p => p.lessonId === l.id && p.completed)) ?? course.lessons[0];
    results.push({ id: course.id, title: course.title, completed: progress.filter(p => p.completed).length, total: course.lessons.length, nextLessonId: target?.id });
  }
  return results;
} });

export async function readCourseLesson(ctx: QueryCtx, args: { courseId: string; lessonId: string }, asActor?: string) {
 const course = await readPublicCourse(ctx, { courseId: args.courseId }, asActor);
 const item = course?.lessons.find(l => l.id === args.lessonId);
 if (!course || !item) return null;
 const lesson = await ctx.db.get("lessons", item.id), version = await ctx.db.get("lessonVersions", item.versionId);
 if (!lesson || !version) return null;
 return { lessonId: lesson._id, ownerId: lesson.ownerId, ownerName: course.ownerName, createdAt: lesson.createdAt, version };
}
export const lesson = query({ args: { courseId: v.string(), lessonId: v.string() }, handler: (ctx, args) => readCourseLesson(ctx, args) });

export const addAssessment = mutation({ args: { courseId: v.id("learnCollections"), asset: v.object({ kind: v.union(v.literal("form"), v.literal("quiz")), id: v.string() }), moduleId: v.optional(v.string()) }, returns: v.null(), handler: async (ctx, args) => {
 const { row } = await ownedCourse(ctx, args.courseId, undefined, true);
 const modules = [...(row.modules ?? [])];
 const index = args.moduleId ? modules.findIndex(m => m.id === args.moduleId) : modules.findIndex(m => m.id === "final_assessment");
 if (args.moduleId && index < 0) throw new Error("Module changed. Refresh and try again.");
 if (index < 0) modules.push({ id: "final_assessment", title: row.metadata.language.startsWith("ar") ? "التقييم النهائي" : "Final assessment", lessonIds: [], assessments: [args.asset] });
 else if (!modules[index].assessments.some(a => a.kind === args.asset.kind && a.id === args.asset.id)) modules[index] = { ...modules[index], assessments: [...modules[index].assessments, args.asset] };
 return setCourseModules(ctx, { courseId: args.courseId, modules });
} });

/** The published course a lesson belongs to, so a plain lesson link can open it inside its course. */
export const courseForLesson = query({ args: { lessonId: v.string() }, returns: v.union(v.null(), v.id("learnCollections")), handler: async (ctx, args) => {
  const id = ctx.db.normalizeId("lessons", args.lessonId);
  const lesson = id ? await ctx.db.get("lessons", id) : null;
  if (!lesson) return null;
  for (const course of await coursesContainingLesson(ctx, lesson.ownerId, lesson._id)) {
    if (!course.items.some(i => i.kind === "lesson" && i.id === lesson._id)) continue;
    if (await readPublicCourse(ctx, { courseId: course._id })) return course._id;
  }
  return null;
} });

// ── Version history ─────────────────────────────────────────────────────────

const courseVersionView = v.object({
  number: v.number(), publishedAt: v.number(), title: v.string(), description: v.string(), outcomes: v.array(v.string()),
  modules: v.array(v.object({ id: v.string(), title: v.string(), lessonIds: v.array(v.id("lessons")) })),
  lessons: v.array(v.object({ id: v.id("lessons"), title: v.string() })),
});

/** The newest published versions of a course for its owner or team editors: outline, lesson titles as published, outcomes. */
export async function listCourseVersions(ctx: QueryCtx, args: { courseId: Id<"learnCollections"> }, asActor?: string) {
  const { row } = await ownedCourse(ctx, args.courseId, asActor, true);
  const rows = await ctx.db.query("collectionVersions").withIndex("by_collectionId_and_number", (q) => q.eq("collectionId", row._id)).order("desc").take(20);
  // Each lesson reads with the title it had in that publication; versions mostly share lesson versions.
  const titles = new Map<string, string>();
  for (const r of rows) for (const item of r.items) {
    if (item.kind !== "lesson" || titles.has(item.versionId)) continue;
    titles.set(item.versionId, (await ctx.db.get("lessonVersions", item.versionId))?.metadata.title ?? "");
  }
  return rows.map((r) => ({
    number: r.number, publishedAt: r.publishedAt, title: r.metadata.title, description: r.metadata.description, outcomes: r.details?.outcomes ?? [],
    modules: (r.modules ?? []).map((m) => ({ id: m.id, title: m.title, lessonIds: m.lessonIds })),
    lessons: r.items.flatMap((item) => (item.kind === "lesson" ? [{ id: item.id, title: titles.get(item.versionId) ?? "" }] : [])),
  }));
}
export const listVersions = query({ args: { courseId: v.id("learnCollections") }, returns: v.array(courseVersionView), handler: (ctx, args) => listCourseVersions(ctx, args) });

/**
 * Copies a published version into the draft: title, description, details, modules and lesson order.
 * Lessons deleted or moved out of the owner's library since are left out. Readers keep the live version until the next publish.
 */
export async function restoreCourseVersion(ctx: MutationCtx, args: { courseId: Id<"learnCollections">; number: number }, asActor?: string) {
  // Owner only: a restore can bring back lessons, which team editors may not add.
  const { row } = await ownedCourse(ctx, args.courseId, asActor);
  const version = await ctx.db.query("collectionVersions").withIndex("by_collectionId_and_number", (q) => q.eq("collectionId", row._id).eq("number", args.number)).unique();
  if (!version) throw new Error("NOT_FOUND: Version not found.");
  const lessonIds: Id<"lessons">[] = [];
  for (const item of version.items) {
    if (item.kind !== "lesson" || lessonIds.includes(item.id)) continue;
    const lesson = await ctx.db.get("lessons", item.id);
    if (lesson && lesson.ownerId === row.ownerId) lessonIds.push(item.id);
  }
  const modules = version.modules?.map((m) => ({ ...m, lessonIds: m.lessonIds.filter((id) => lessonIds.includes(id)) }));
  await authorDb(ctx).patch("learnCollections", row._id, { metadata: version.metadata, details: version.details, modules, lessonIds, updatedAt: Date.now() });
  return null;
}
export const restoreVersion = mutation({ args: { courseId: v.id("learnCollections"), number: v.number() }, returns: v.null(), handler: (ctx, args) => restoreCourseVersion(ctx, args) });
