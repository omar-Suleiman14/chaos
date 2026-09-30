import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { creatorRestricted, requireActiveUser } from "./authz";
import { lessonAccess, lessonSummary } from "./lessons";
import { lessonMeta } from "./learnModel";
import { questionsFromForm, questionsFromLegacy } from "./liveLogic";
import { canonicalCommunityActor } from "./learnCommunityIntegrations";

function pageCheck(count: number) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 50) throw new Error("Page size must be 1–50");
}

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
      if (lesson.status !== "active" || !lesson.publishedVersionId || await creatorRestricted(ctx, lesson.ownerId)) continue;
      const version = await ctx.db.get("lessonVersions", lesson.publishedVersionId);
      if (!version || version.lessonId !== lesson._id || version.metadata.indexing !== "index" || (version.visibility !== undefined && version.visibility !== "public")) continue;
      page.push({ lessonId: lesson._id, versionId: version._id, metadata: version.metadata, publishedAt: version.publishedAt });
    }
    return { ...result, page };
  },
});

const assessment = v.object({ kind: v.union(v.literal("form"), v.literal("quiz")), id: v.union(v.id("forms"), v.id("quizzes")), title: v.string(), shareId: v.union(v.string(), v.null()), href: v.string(), questionCount: v.number(), published: v.literal(true), liveEligible: v.boolean() });
export const attachedQuizzes = query({
  args: { lessonId: v.id("lessons") }, returns: v.array(assessment),
  handler: async (ctx, args) => {
    await lessonAccess(ctx, args.lessonId);
    const links = await ctx.db.query("lessonAssessments").withIndex("by_lessonId_and_order", q => q.eq("lessonId", args.lessonId)).take(50);
    const result = [];
    for (const link of links) {
      if (link.asset.kind === "form") {
        const form = await ctx.db.get("forms", link.asset.id);
        if (!form || form.status !== "live" || form.isBanned || form.publishedVersion === undefined || await creatorRestricted(ctx, form.ownerId)) continue;
        const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", q => q.eq("formId", form._id).eq("version", form.publishedVersion!)).unique();
        if (!version?.definition.quiz?.enabled) continue;
        const definition = version.definition;
        result.push({ kind: "form" as const, id: form._id, title: definition.title, shareId: form.shareId, href: `/f/${encodeURIComponent(form.shareId)}`, questionCount: definition.fields.filter(f => f.type !== "section").length, published: true as const, liveEligible: questionsFromForm(definition, definition.defaultLanguage).questions.length > 0 });
      } else {
        const quiz = await ctx.db.get("quizzes", link.asset.id);
        if (!quiz?.isPublished || quiz.isBanned || !quiz.publishedSnapshot || await creatorRestricted(ctx, quiz.creatorId)) continue;
        result.push({ kind: "quiz" as const, id: quiz._id, title: quiz.publishedSnapshot.title, shareId: null, href: `/${encodeURIComponent(quiz.creatorUsername)}/${encodeURIComponent(quiz.slug)}`, questionCount: quiz.publishedSnapshot.questions.length, published: true as const, liveEligible: questionsFromLegacy(quiz.publishedSnapshot.questions).questions.length > 0 });
      }
    }
    return result;
  },
});

export const publicProfile = query({
  args: { username: v.string() },
  returns: v.union(v.null(), v.object({ username: v.string(), name: v.string(), imageUrl: v.union(v.string(), v.null()), verifiedRoles: v.array(v.union(v.literal("student"), v.literal("educator"))) })),
  handler: async (ctx, args) => {
    if (!args.username || args.username.length > 100) return null;
    const user = await ctx.db.query("users").withIndex("by_username", q => q.eq("username", args.username)).unique();
    if (!user || await creatorRestricted(ctx, user.clerkId)) return null;
    const userKey = canonicalCommunityActor(user.clerkId).tokenIdentifier;
    const claims = await ctx.db.query("learnIdentityClaims").withIndex("by_userKey_and_role", q => q.eq("userKey", userKey)).take(2);
    return { username: user.username, name: user.name, imageUrl: user.imageUrl ?? null, verifiedRoles: claims.filter(c => c.status === "verified" && c.method === "manual_review" && !!c.reviewedBy && (c.expiresAt ?? 0) > Date.now()).map(c => c.role) };
  },
});
