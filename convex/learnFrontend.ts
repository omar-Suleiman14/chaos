import { getAuthIdentity } from "./authIdentity";
import { teamAudienceAllows } from "./businessAccess";
import { lessonAccessForActor } from "./lessons";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { creatorRestricted, requireActiveUser } from "./authz";
import { lessonAccess, lessonSummary } from "./lessons";
import { createdWith, lessonMeta } from "./learnModel";
import { questionsFromForm } from "./liveLogic";
import { publicIdentityFacts } from "./publicIdentityPolicy";
import schema from "./schema";
import { hasLiveLessonPublication } from "./publicationEligibility";

function pageCheck(count: number) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 50) throw new Error("Page size must be 1–50");
}

/** An anonymous, fail-closed metadata read. Owner/editor grants cannot make a private asset indexable. */
export const publicLesson = query({
  args: { id: v.string() },
  returns: v.union(v.null(), v.object({ lessonId: v.id("lessons"), ownerId: v.string(), ownerName: v.string(), createdWith: v.optional(createdWith), createdAt: v.number(), version: schema.doc("lessonVersions") })),
  handler: async (ctx, args) => {
    if (!args.id || args.id.length > 100) return null;
    const id = ctx.db.normalizeId("lessons", args.id);
    if (!id) return null;
    const lesson = await ctx.db.get("lessons", id);
    // Team-only lessons read like public ones for members of their team.
    const team = !!lesson && await teamAudienceAllows(ctx, lesson, (await getAuthIdentity(ctx))?.subject);
    if (!hasLiveLessonPublication(lesson) || (lesson.visibility !== "public" && !team) || await creatorRestricted(ctx, lesson.ownerId)) return null;
    const version = await ctx.db.get("lessonVersions", lesson.publishedVersionId);
    if (!version || version.lessonId !== id || (!team && version.visibility !== undefined && version.visibility !== "public")) return null;
    const owner = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", lesson.ownerId)).first();
    return { lessonId: id, ownerId: lesson.ownerId, ownerName: version.metadata.authorDisplay ?? owner?.name ?? "Chaos creator", ...(lesson.createdWith ? { createdWith: lesson.createdWith } : {}), createdAt: lesson.createdAt, version };
  },
});

/** Fast batched metadata + version lookup for multiple public lessons in one roundtrip. */
export const publicLessonsBatch = query({
  args: { ids: v.array(v.string()) },
  returns: v.array(v.object({ lessonId: v.id("lessons"), ownerId: v.string(), ownerName: v.string(), createdWith: v.optional(createdWith), createdAt: v.number(), version: schema.doc("lessonVersions") })),
  handler: async (ctx, args) => {
    const viewer = (await getAuthIdentity(ctx))?.subject;
    // Request-local promises share concurrent reads, never authorization across requests.
    const restrictions = new Map<string, Promise<boolean>>();
    const owners = new Map<string, Promise<Doc<"users"> | null>>();
    const results = await Promise.all(args.ids.slice(0, 50).map(async rawId => {
      if (!rawId || rawId.length > 100) return null;
      const id = ctx.db.normalizeId("lessons", rawId);
      if (!id) return null;
      const lesson = await ctx.db.get("lessons", id);
      const team = !!lesson && await teamAudienceAllows(ctx, lesson, viewer);
      if (!hasLiveLessonPublication(lesson) || (lesson.visibility !== "public" && !team)) return null;
      let restricted = restrictions.get(lesson.ownerId);
      if (!restricted) {
        restricted = creatorRestricted(ctx, lesson.ownerId);
        restrictions.set(lesson.ownerId, restricted);
      }
      if (await restricted) return null;
      const version = await ctx.db.get("lessonVersions", lesson.publishedVersionId);
      if (!version || version.lessonId !== id || (!team && version.visibility !== undefined && version.visibility !== "public")) return null;
      let ownerRead = owners.get(lesson.ownerId);
      if (!ownerRead) {
        ownerRead = ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", lesson.ownerId)).first();
        owners.set(lesson.ownerId, ownerRead);
      }
      const owner = await ownerRead;
      return { lessonId: id, ownerId: lesson.ownerId, ownerName: version.metadata.authorDisplay ?? owner?.name ?? "Chaos creator", ...(lesson.createdWith ? { createdWith: lesson.createdWith } : {}), createdAt: lesson.createdAt, version };
    }));
    return results.filter(row => row !== null);
  },
});

/** Direct editor lookup does not depend on a bounded dashboard page containing this asset. */
export const editableLesson = query({
  args: { id: v.string() }, returns: v.union(v.null(), schema.doc("lessons")),
  handler: async (ctx, args) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity || !args.id || args.id.length > 100) return null;
    const id = ctx.db.normalizeId("lessons", args.id);
    if (!id) return null;
    const lesson = await ctx.db.get("lessons", id);
    if (!lesson) return null;
    if (lesson.ownerId === identity.subject) return lesson;
    const grant = await ctx.db.query("lessonPermissions").withIndex("by_lessonId_and_userId", q => q.eq("lessonId", id).eq("userId", identity.subject)).unique();
    if (grant?.role === "editor") return lesson;
    try { return await lessonAccessForActor(ctx, identity.subject, id, true); } catch { return null; }
  },
});

/** Dashboard cards deliberately omit the potentially large draft document. */
export const listOwned = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(lessonSummary),
  handler: async (ctx, args) => {
    pageCheck(args.paginationOpts.numItems);
    const { identity } = await requireActiveUser(ctx);
    const result = await ctx.db.query("lessons").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", identity.subject)).order("desc").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(l => ({ lessonId: l._id, metadata: l.metadata, revision: l.revision, status: l.status, visibility: l.visibility, communityState: l.communityState, publishedVersionId: l.publishedVersionId ?? null, updatedAt: l.updatedAt })) };
  },
});

const indexEntry = v.object({ lessonId: v.id("lessons"), versionId: v.id("lessonVersions"), metadata: lessonMeta, publishedAt: v.number() });
/** Public SEO discovery uses immutable published metadata, never draft titles. */
export const listIndexableLessons = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(indexEntry),
  handler: async (ctx, args) => {
    pageCheck(args.paginationOpts.numItems);
    const result = await ctx.db.query("lessons").withIndex("by_visibility_and_communityState", q => q.eq("visibility", "public").eq("communityState", "ok")).paginate(args.paginationOpts);
    const page = [];
    for (const lesson of result.page) {
      if (!hasLiveLessonPublication(lesson) || await creatorRestricted(ctx, lesson.ownerId)) continue;
      const version = await ctx.db.get("lessonVersions", lesson.publishedVersionId);
      if (!version || version.lessonId !== lesson._id || version.metadata.indexing !== "index" || (version.visibility !== undefined && version.visibility !== "public")) continue;
      page.push({ lessonId: lesson._id, versionId: version._id, metadata: version.metadata, publishedAt: version.publishedAt });
    }
    return { ...result, page };
  },
});

const assessment = v.object({ kind: v.literal("form"), id: v.id("forms"), title: v.string(), shareId: v.union(v.string(), v.null()), href: v.string(), questionCount: v.number(), published: v.literal(true), liveEligible: v.boolean() });
export const attachedQuizzes = query({
  args: { lessonId: v.id("lessons") }, returns: v.array(assessment),
  handler: async (ctx, args) => {
    await lessonAccess(ctx, args.lessonId);
    const links = await ctx.db.query("lessonAssessments").withIndex("by_lessonId_and_order", q => q.eq("lessonId", args.lessonId)).take(50);
    const result = [];
    for (const link of links) {
      if (link.asset.kind !== "form") continue;
      const form = await ctx.db.get("forms", link.asset.id);
      if (!form || form.status !== "live" || form.isBanned || form.publishedVersion === undefined || await creatorRestricted(ctx, form.ownerId)) continue;
      const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", q => q.eq("formId", form._id).eq("version", form.publishedVersion!)).unique();
      if (!version?.definition.quiz?.enabled) continue;
      const definition = version.definition;
      result.push({ kind: "form" as const, id: form._id, title: definition.title, shareId: form.shareId, href: `/f/${encodeURIComponent(form.shareId)}`, questionCount: definition.fields.filter(f => f.type !== "section").length, published: true as const, liveEligible: questionsFromForm(definition, definition.defaultLanguage).questions.length > 0 });
    }
    return result;
  },
});

export const publicProfile = query({
  args: { username: v.string() },
  returns: v.union(v.null(), v.object({ username: v.string(), name: v.string(), imageUrl: v.union(v.string(), v.null()), verifiedRoles: v.array(v.union(v.literal("student"), v.literal("educator"))) })),
  handler: async (ctx, args) => {
    const facts = await publicIdentityFacts(ctx, args.username);
    if (!facts) return null;
    const { user, verified } = facts;
    return { username: user.username, name: user.name, imageUrl: user.imageUrl ?? null, verifiedRoles: verified.map(c => c.role) };
  },
});

export const embeddedQuiz = query({
  args: { asset: v.object({ kind: v.union(v.literal("form"), v.literal("quiz")), id: v.string() }) },
  returns: v.union(v.null(), v.object({ title: v.string(), shareId: v.union(v.string(), v.null()), href: v.string(), questionCount: v.number() })),
  handler: async (ctx, { asset }) => {
    // Classic quiz blocks were converted to quiz forms; any left over render nothing.
    if (asset.kind !== "form") return null;
    const id = ctx.db.normalizeId("forms", asset.id);
    const form = id ? await ctx.db.get("forms", id) : null;
    if (!form || form.status !== "live" || form.isBanned || form.publishedVersion === undefined || await creatorRestricted(ctx, form.ownerId)) return null;
    const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", q => q.eq("formId", form._id).eq("version", form.publishedVersion!)).unique();
    return version?.definition.quiz?.enabled ? { title: version.definition.title, shareId: form.shareId, href: `/f/${encodeURIComponent(form.shareId)}`, questionCount: version.definition.fields.filter(f => f.type !== "section" && f.type !== "statement").length } : null;
  },
});

/** Public block metadata; recheck current lifecycle so old lesson versions cannot leak private decks. */
export const embeddedFlashcards = query({
  args: { setId: v.string() },
  returns: v.union(v.null(), v.object({ title: v.string(), cardCount: v.number() })),
  handler: async (ctx, { setId }) => {
    const id = ctx.db.normalizeId("flashcardSets", setId);
    const deck = id ? await ctx.db.get("flashcardSets", id) : null;
    if (!deck || deck.archived || (deck.visibility !== "public" && !await teamAudienceAllows(ctx, deck, (await getAuthIdentity(ctx))?.subject)) || !deck.publishedVersionId || await creatorRestricted(ctx, deck.ownerId)) return null;
    const version = await ctx.db.get("flashcardVersions", deck.publishedVersionId);
    return version?.setId === deck._id ? { title: version.title, cardCount: version.cards.length } : null;
  },
});
