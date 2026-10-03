import { getAuthIdentity } from "./authIdentity";
import { authorDb } from "./authorIndex";
import { consumeRate } from "./serverUtils";
import { v } from "convex/values";
import { resolveStudyTarget, readStudyProgress, startStudySession, completeStudyBlocks } from "./learnProgressServices";
import { docValidator } from "convex/server";
import {
  mutation,
  query,
  type QueryCtx as ReadCtx,
  type MutationCtx as WriteCtx,
} from "./_generated/server";
import { lessonAccess, lessonAccessForActor } from "./lessons";
import { requireActiveUser, requireAdmin, creatorRestricted } from "./authz";
import {
  communityTables,
  counters,
  progressKey,
  reportCategory,
  identityStatus,
  claimRole,
  qualityStatus,
} from "./learnCommunityModel";
import { lessonDocument, lessonMeta, LEARN_WRITE_LIMITS } from "./learnModel";
import type { Id } from "./_generated/dataModel";

const lessonArg = { lessonId: v.id("lessons") };
function text(value: string, max = 2000) {
  const clean = value.trim();
  if (!clean || clean.length > max) throw new Error("Invalid text length");
  return clean;
}
function integer(value: number, min = 0) {
  if (!Number.isSafeInteger(value) || value < min)
    throw new Error("Invalid sequence or revision");
}
async function actor(ctx: ReadCtx | WriteCtx) {
  return (await requireActiveUser(ctx)).identity;
}
async function publicLesson(ctx: ReadCtx | WriteCtx, lessonId: Id<"lessons">) {
  const lesson = await lessonAccess(ctx, lessonId);
  if (
    lesson.status !== "active" ||
    lesson.visibility !== "public" ||
    lesson.communityState !== "ok" ||
    !lesson.publishedVersionId ||
    await creatorRestricted(ctx, lesson.ownerId)
  )
    throw new Error("Lesson is not public");
  const version = await ctx.db.get("lessonVersions", lesson.publishedVersionId);
  if (!version || version.lessonId !== lessonId || (version.visibility !== undefined && version.visibility !== "public"))
    throw new Error("Published version unavailable");
  return { lesson, version };
}
async function stats(ctx: ReadCtx | WriteCtx, lessonId: Id<"lessons">) {
  return ctx.db
    .query("learnCommunityStats")
    .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
    .unique();
}
async function countDelta(
  ctx: WriteCtx,
  lessonId: Id<"lessons">,
  delta: { saves?: number; helpful?: number; views?: number },
) {
  const row = await stats(ctx, lessonId);
  const next = {
    saves: (row?.saves ?? 0) + (delta.saves ?? 0),
    helpful: (row?.helpful ?? 0) + (delta.helpful ?? 0),
    views: (row?.views ?? 0) + (delta.views ?? 0),
  };
  if (Object.values(next).some((n) => n < 0 || !Number.isSafeInteger(n)))
    throw new Error("Aggregate invariant violated");
  if (row) await ctx.db.patch("learnCommunityStats", row._id, next);
  else await ctx.db.insert("learnCommunityStats", { lessonId, ...next });
}
export const get = query({
  args: lessonArg,
  returns: v.object({
    lessonId: v.id("lessons"),
    versionId: v.id("lessonVersions"),
    metadata: lessonMeta,
    document: lessonDocument,
    counts: counters,
    quality: qualityStatus,
  }),
  handler: async (ctx, { lessonId }) => {
    const { version } = await publicLesson(ctx, lessonId);
    const row = await stats(ctx, lessonId);
    const quality = await ctx.db
      .query("learnQuality")
      .withIndex("by_lessonId_and_versionId", (q) =>
        q.eq("lessonId", lessonId).eq("versionId", version._id),
      )
      .unique();
    return {
      lessonId,
      versionId: version._id,
      metadata: version.metadata,
      document: version.document,
      counts: {
        saves: row?.saves ?? 0,
        helpful: row?.helpful ?? 0,
        views: row?.views ?? 0,
      },
      quality: quality?.status ?? "unreviewed",
    };
  },
});
export async function requirePublicCommunityLesson(ctx: ReadCtx | WriteCtx, subject: string, lessonId: Id<"lessons">) {
  const lesson = await lessonAccessForActor(ctx, subject, lessonId);
  if (lesson.status !== "active" || lesson.visibility !== "public" || lesson.communityState !== "ok" || !lesson.publishedVersionId || await creatorRestricted(ctx, lesson.ownerId)) throw new Error("Lesson is not public");
  const version = await ctx.db.get("lessonVersions", lesson.publishedVersionId);
  if (!version || version.lessonId !== lessonId || (version.visibility !== undefined && version.visibility !== "public")) throw new Error("Published version unavailable");
  return { lesson, version };
}
/** Actor must come from native auth or a trusted internal transport, never client input. */
export async function setSignalsForActor(ctx: WriteCtx, identity: { subject: string; tokenIdentifier: string }, args: { lessonId: Id<"lessons">; saved?: boolean; helpful?: boolean }) {
    // Withdrawal remains possible after unpublication/moderation without revealing content.
    if (args.saved === true || args.helpful === true)
      await requirePublicCommunityLesson(ctx, identity.subject, args.lessonId);
    const old = await ctx.db
      .query("learnCommunitySignals")
      .withIndex("by_lessonId_and_userKey", (q) =>
        q.eq("lessonId", args.lessonId).eq("userKey", identity.tokenIdentifier),
      )
      .unique();
    const saved = args.saved ?? old?.saved ?? false,
      helpful = args.helpful ?? old?.helpful ?? false;
    const delta = {
      saves: Number(saved) - Number(old?.saved ?? false),
      helpful: Number(helpful) - Number(old?.helpful ?? false),
    };
    if (!old && !saved && !helpful) return null;
    if (old && old.saved === saved && old.helpful === helpful) return null;
    await consumeRate(ctx, `learn:signals:${identity.tokenIdentifier}`, LEARN_WRITE_LIMITS.signalsPerMinute, 60000);
    if (old)
      await ctx.db.patch("learnCommunitySignals", old._id, { saved, helpful });
    else
      await ctx.db.insert("learnCommunitySignals", {
        lessonId: args.lessonId,
        userKey: identity.tokenIdentifier,
        saved,
        helpful,
      });
    if (delta.saves || delta.helpful)
      await countDelta(ctx, args.lessonId, delta);
    return null;

}
export const setSignals = mutation({
  args: { ...lessonArg, saved: v.optional(v.boolean()), helpful: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => setSignalsForActor(ctx, await actor(ctx), args),
});
export const recordView = mutation({
  args: {
    ...lessonArg,
    versionId: v.id("lessonVersions"),
    blockId: v.string(),
    engagedSeconds: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const { version } = await publicLesson(ctx, args.lessonId);
    if (
      version._id !== args.versionId ||
      !version.document.blocks.some((b) => b.id === args.blockId) ||
      !Number.isFinite(args.engagedSeconds) ||
      args.engagedSeconds < 15 ||
      args.engagedSeconds > 3600
    )
      throw new Error("Meaningful published-block engagement required");
    // Client-reported engagement is not verified attention or mastery.
    const now = Date.now(),
      day = Math.floor(now / 86_400_000);
    const prior = await ctx.db
      .query("learnCommunityViews")
      .withIndex("by_lessonId_and_userKey_and_day", (q) =>
        q
          .eq("lessonId", args.lessonId)
          .eq("userKey", identity.tokenIdentifier)
          .eq("day", day),
      )
      .unique();
    if (prior) return false;
    await ctx.db.insert("learnCommunityViews", {
      lessonId: args.lessonId,
      userKey: identity.tokenIdentifier,
      day,
      versionId: args.versionId,
      blockId: args.blockId,
      recordedAt: now,
    });
    await countDelta(ctx, args.lessonId, { views: 1 });
    return true;
  },
});

async function progressTarget(ctx: ReadCtx | WriteCtx, args: { lessonId: Id<"lessons">; versionId?: Id<"lessonVersions">; revision?: number }) {
  const identity = await getAuthIdentity(ctx);
  return resolveStudyTarget(ctx, { subject: identity?.subject ?? null }, args);
}
const progressDoc = docValidator(
  "learnProgress",
  communityTables.learnProgress,
);
export const startSession = mutation({
  args: progressKey, returns: v.number(),
  handler: async (ctx, args) => startStudySession(ctx, await actor(ctx), args),
});
export const completeBlocks = mutation({
  args: { ...progressKey, sessionSeq: v.number(), writeSeq: v.number(), blockIds: v.array(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => (await completeStudyBlocks(ctx, await actor(ctx), args, "false")) !== false,
});
export const getProgress = query({
  args: progressKey, returns: v.union(progressDoc, v.null()),
  handler: async (ctx, args) => readStudyProgress(ctx, await actor(ctx), args),
});
export const createConcept = mutation({
  args: { slug: v.string(), title: v.string(), description: v.string() },
  returns: v.id("learnConcepts"),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    await requireAdmin(ctx);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.slug) || args.slug.length > 100)
      throw new Error("Invalid stable concept slug");
    const title = text(args.title, 200),
      description = text(args.description);
    const old = await ctx.db
      .query("learnConcepts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (old) {
      if (old.title !== title || old.description !== description)
        throw new Error("Concept slug already defined");
      return old._id;
    }
    return ctx.db.insert("learnConcepts", {
      slug: args.slug,
      title,
      description,
      createdBy: identity.tokenIdentifier,
    });
  },
});
export const mapConcept = mutation({
  args: {
    ...lessonArg,
    versionId: v.id("lessonVersions"),
    blockId: v.string(),
    conceptId: v.id("learnConcepts"),
    questionId: v.optional(v.id("questions")),
  },
  returns: v.id("learnConceptMappings"),
  handler: async (ctx, args) => {
    await actor(ctx);
    await requireAdmin(ctx);
    const lesson = await ctx.db.get("lessons", args.lessonId),
      version = await ctx.db.get("lessonVersions", args.versionId);
    if (
      !lesson ||
      !version ||
      version.lessonId !== lesson._id ||
      !version.document.blocks.some((b) => b.id === args.blockId) ||
      !(await ctx.db.get("learnConcepts", args.conceptId))
    )
      throw new Error("Invalid concept mapping");
    if (args.questionId) {
      const question = await ctx.db.get("questions", args.questionId),
        quiz = question ? await ctx.db.get("quizzes", question.quizId) : null;
      if (
        !question ||
        question.deletedAt ||
        !quiz ||
        quiz.creatorId !== lesson.ownerId ||
        !version.document.blocks.some(
          (b) =>
            b.type === "quiz" &&
            b.asset.kind === "quiz" &&
            b.asset.id === quiz._id,
        )
      )
        throw new Error("Question must belong to an owned embedded quiz");
    }
    const old = await ctx.db
      .query("learnConceptMappings")
      .withIndex(
        "by_lesson_version_block_concept_question",
        (q) =>
          q
            .eq("lessonId", args.lessonId)
            .eq("versionId", args.versionId)
            .eq("blockId", args.blockId)
            .eq("conceptId", args.conceptId)
            .eq("questionId", args.questionId),
      )
      .unique();
    return old?._id ?? ctx.db.insert("learnConceptMappings", args);
  },
});
export const learningEvidence = query({
  args: {
    ...lessonArg,
    versionId: v.id("lessonVersions"),
    conceptId: v.id("learnConcepts"),
  },
  returns: v.object({
    state: v.union(v.literal("no_evidence"), v.literal("exposure_reported")),
    completedMappedBlocks: v.number(),
    mappedBlocks: v.number(),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const target = await progressTarget(ctx, args);
    const rows = await ctx.db
      .query("learnConceptMappings")
      .withIndex("by_lessonId_and_versionId_and_conceptId", (q) =>
        q
          .eq("lessonId", args.lessonId)
          .eq("versionId", args.versionId)
          .eq("conceptId", args.conceptId),
      )
      .take(501);
    if (rows.length > 500) throw new Error("Evidence mapping bound exceeded");
    const mapped = new Set(rows.map((r) => r.blockId));
    const progress = await ctx.db
      .query("learnProgress")
      .withIndex("by_userKey_and_lessonId_and_key", (q) =>
        q
          .eq("userKey", identity.tokenIdentifier)
          .eq("lessonId", args.lessonId)
          .eq("key", target.key),
      )
      .unique();
    const completedMappedBlocks = [...mapped].filter((id) =>
      progress?.completedBlocks.includes(id),
    ).length;
    return {
      state: completedMappedBlocks
        ? ("exposure_reported" as const)
        : ("no_evidence" as const),
      completedMappedBlocks,
      mappedBlocks: mapped.size,
      reason: completedMappedBlocks
        ? "Self-reported block completion indicates exposure only; correctness and mastery are unconfirmed."
        : "No completed mapped blocks for this version. Quiz scores are not imported or inferred.",
    };
  },
});
export const report = mutation({
  args: { ...lessonArg, category: reportCategory, detail: v.string() },
  returns: v.id("learnReports"),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    await lessonAccess(ctx, args.lessonId);
    // Reports lower a lesson's ranking and fill the review queue, so one account gets a bounded number.
    await consumeRate(ctx, `learn:report:${identity.tokenIdentifier}`, 20, 60 * 60 * 1000);
    const detail = text(args.detail);
    const old = await ctx.db
      .query("learnReports")
      .withIndex("by_lessonId_and_reporterKey_and_category", (q) =>
        q
          .eq("lessonId", args.lessonId)
          .eq("reporterKey", identity.tokenIdentifier)
          .eq("category", args.category),
      )
      .unique();
    // One immutable report per reporter/category. Reports do not automatically hide content.
    return (
      old?._id ??
      ctx.db.insert("learnReports", {
        lessonId: args.lessonId,
        category: args.category,
        detail,
        reporterKey: identity.tokenIdentifier,
        status: "open",
        createdAt: Date.now(),
      })
    );
  },
});
export const listReports = query({
  args: { status: v.union(v.literal("open"), v.literal("resolved")) },
  returns: v.array(docValidator("learnReports", communityTables.learnReports)),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db
      .query("learnReports")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .take(50);
  },
});
export const moderate = mutation({
  args: {
    ...lessonArg,
    action: v.union(
      v.literal("hide"),
      v.literal("review"),
      v.literal("restore"),
      v.literal("remove"),
    ),
    reason: v.string(),
    reportId: v.optional(v.id("learnReports")),
  },
  returns: v.id("learnModerationAudit"),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    await requireAdmin(ctx);
    const reason = text(args.reason);
    const lesson = await ctx.db.get("lessons", args.lessonId);
    if (!lesson) throw new Error("Lesson not found");
    if (args.reportId) {
      const report = await ctx.db.get("learnReports", args.reportId);
      if (!report || report.lessonId !== args.lessonId)
        throw new Error("Report mismatch");
      await ctx.db.patch("learnReports", report._id, { status: "resolved" });
    }
    const after = (
      {
        hide: "hidden",
        review: "review",
        restore: "ok",
        remove: "removed",
      } as const
    )[args.action];
    await authorDb(ctx).patch("lessons", lesson._id, {
      communityState: after,
      revision: lesson.revision + 1,
      updatedAt: Date.now(),
    });
    // Removal is a reversible takedown; published versions and learner records survive.
    return ctx.db.insert("learnModerationAudit", {
      lessonId: args.lessonId,
      actorKey: identity.tokenIdentifier,
      action: args.action,
      before: lesson.communityState,
      after,
      reason,
      createdAt: Date.now(),
      ...(args.reportId ? { reportId: args.reportId } : {}),
    });
  },
});
export const moderationHistory = query({
  args: lessonArg,
  returns: v.array(
    docValidator("learnModerationAudit", communityTables.learnModerationAudit),
  ),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const lesson = await ctx.db.get("lessons", args.lessonId);
    if (!lesson || lesson.ownerId !== identity.subject) await requireAdmin(ctx);
    return ctx.db
      .query("learnModerationAudit")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", args.lessonId))
      .order("desc")
      .take(50);
  },
});
export const appeal = mutation({
  args: {
    ...lessonArg,
    auditId: v.id("learnModerationAudit"),
    reason: v.string(),
  },
  returns: v.id("learnAppeals"),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const lesson = await lessonAccess(ctx, args.lessonId, true);
    if (lesson.ownerId !== identity.subject)
      throw new Error("Only owner can appeal");
    const audit = await ctx.db.get("learnModerationAudit", args.auditId);
    if (
      !audit ||
      audit.lessonId !== args.lessonId ||
      audit.action === "restore"
    )
      throw new Error("Invalid takedown audit");
    const reason = text(args.reason);
    const old = await ctx.db
      .query("learnAppeals")
      .withIndex("by_auditId_and_ownerKey", (q) =>
        q.eq("auditId", args.auditId).eq("ownerKey", identity.tokenIdentifier),
      )
      .unique();
    return (
      old?._id ??
      ctx.db.insert("learnAppeals", {
        lessonId: args.lessonId,
        auditId: args.auditId,
        ownerKey: identity.tokenIdentifier,
        reason,
        status: "open",
        createdAt: Date.now(),
      })
    );
  },
});
export const resolveAppeal = mutation({
  args: {
    appealId: v.id("learnAppeals"),
    accepted: v.boolean(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    await requireAdmin(ctx);
    const reason = text(args.reason);
    const appeal = await ctx.db.get("learnAppeals", args.appealId);
    if (!appeal || appeal.status !== "open")
      throw new Error("Appeal is not open");
    // Decision does not restore content automatically: admin must explicitly restore,
    // so accepting an old appeal never overrides a newer moderation decision.
    const status = args.accepted ? ("accepted" as const) : ("denied" as const);
    await ctx.db.patch("learnAppeals", appeal._id, {
      status,
      resolution: reason,
      resolvedBy: identity.tokenIdentifier,
    });
    await ctx.db.insert("learnAppealAudit", {
      appealId: appeal._id,
      actorKey: identity.tokenIdentifier,
      status,
      reason,
      createdAt: Date.now(),
    });
    return null;
  },
});
export const getAppeal = query({
  args: { appealId: v.id("learnAppeals") },
  returns: v.union(
    docValidator("learnAppeals", communityTables.learnAppeals),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const row = await ctx.db.get("learnAppeals", args.appealId);
    if (row && row.ownerKey !== identity.tokenIdentifier)
      await requireAdmin(ctx);
    return row;
  },
});
export const claimIdentity = mutation({
  args: { role: claimRole, institution: v.string() },
  returns: v.id("learnIdentityClaims"),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const institution = text(args.institution, 200);
    const old = await ctx.db
      .query("learnIdentityClaims")
      .withIndex("by_userKey_and_role", (q) =>
        q.eq("userKey", identity.tokenIdentifier).eq("role", args.role),
      )
      .unique();
    if (old) {
      if (old.institution !== institution)
        throw new Error("Existing claim differs; contact review team");
      return old._id;
    }
    return ctx.db.insert("learnIdentityClaims", {
      userKey: identity.tokenIdentifier,
      role: args.role,
      institution,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});
export const getMyClaims = query({
  args: {},
  returns: v.array(
    docValidator("learnIdentityClaims", communityTables.learnIdentityClaims),
  ),
  handler: async (ctx) => {
    const identity = await actor(ctx);
    return ctx.db
      .query("learnIdentityClaims")
      .withIndex("by_userKey_and_role", (q) =>
        q.eq("userKey", identity.tokenIdentifier),
      )
      .take(2);
  },
});
export const reviewIdentity = mutation({
  args: {
    claimId: v.id("learnIdentityClaims"),
    status: identityStatus,
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    await requireAdmin(ctx);
    const reason = text(args.reason);
    const claim = await ctx.db.get("learnIdentityClaims", args.claimId);
    if (!claim)
      throw new Error("Claim not found");
    await ctx.db.patch("learnIdentityClaims", args.claimId, {
      status: args.status,
      reason,
      reviewedBy: identity.tokenIdentifier,
      method: "manual_review",
      verifiedAt: args.status === "verified" ? Date.now() : undefined,
      expiresAt: args.status === "verified" ? Date.now() + (claim.role === "student" ? 180 : 365) * 86400000 : undefined,
    });
    await ctx.db.insert("learnIdentityAudit", {
      claimId: args.claimId,
      actorKey: identity.tokenIdentifier,
      status: args.status,
      reason,
      createdAt: Date.now(),
    });
    return null;
  },
});
export const reviewQuality = mutation({
  args: {
    ...lessonArg,
    versionId: v.id("lessonVersions"),
    status: qualityStatus,
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    await requireAdmin(ctx);
    const reason = text(args.reason);
    const version = await ctx.db.get("lessonVersions", args.versionId);
    if (!version || version.lessonId !== args.lessonId)
      throw new Error("Version mismatch");
    const old = await ctx.db
      .query("learnQuality")
      .withIndex("by_lessonId_and_versionId", (q) =>
        q.eq("lessonId", args.lessonId).eq("versionId", args.versionId),
      )
      .unique();
    if (old)
      await ctx.db.patch("learnQuality", old._id, {
        status: args.status,
        reason,
      });
    else
      await ctx.db.insert("learnQuality", {
        lessonId: args.lessonId,
        versionId: args.versionId,
        status: args.status,
        reason,
      });
    await ctx.db.insert("learnQualityAudit", {
      ...args,
      reason,
      actorKey: identity.tokenIdentifier,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const getMySignals = query({
  args: lessonArg,
  returns: v.object({ saved: v.boolean(), helpful: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const row = await ctx.db
      .query("learnCommunitySignals")
      .withIndex("by_lessonId_and_userKey", (q) =>
        q.eq("lessonId", args.lessonId).eq("userKey", identity.tokenIdentifier),
      )
      .unique();
    // Only the caller's flags; no lesson data disclosed after access is revoked.
    return { saved: row?.saved ?? false, helpful: row?.helpful ?? false };
  },
});
export const getReport = query({
  args: { reportId: v.id("learnReports") },
  returns: v.union(
    docValidator("learnReports", communityTables.learnReports),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const row = await ctx.db.get("learnReports", args.reportId);
    if (row && row.reporterKey !== identity.tokenIdentifier)
      await requireAdmin(ctx);
    return row;
  },
});
export const listIdentityClaims = query({
  args: { status: identityStatus },
  returns: v.array(
    docValidator("learnIdentityClaims", communityTables.learnIdentityClaims),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db
      .query("learnIdentityClaims")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .take(50);
  },
});
export const getQualityReview = query({
  args: { ...lessonArg, versionId: v.id("lessonVersions") },
  returns: v.union(
    docValidator("learnQuality", communityTables.learnQuality),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const version = await ctx.db.get("lessonVersions", args.versionId);
    if (!version || version.lessonId !== args.lessonId)
      throw new Error("Version mismatch");
    return ctx.db
      .query("learnQuality")
      .withIndex("by_lessonId_and_versionId", (q) =>
        q.eq("lessonId", args.lessonId).eq("versionId", args.versionId),
      )
      .unique();
  },
});
export const getConceptMappings = query({
  args: {
    ...lessonArg,
    versionId: v.id("lessonVersions"),
    conceptId: v.id("learnConcepts"),
  },
  returns: v.array(
    docValidator("learnConceptMappings", communityTables.learnConceptMappings),
  ),
  handler: async (ctx, args) => {
    await progressTarget(ctx, args);
    return ctx.db
      .query("learnConceptMappings")
      .withIndex("by_lessonId_and_versionId_and_conceptId", (q) =>
        q
          .eq("lessonId", args.lessonId)
          .eq("versionId", args.versionId)
          .eq("conceptId", args.conceptId),
      )
      .take(50);
  },
});
const rankedLesson = v.object({
  lessonId: v.id("lessons"),
  versionId: v.id("lessonVersions"),
  metadata: lessonMeta,
  counts: counters,
  score: v.number(),
  signals: v.object({
    engagement: v.number(),
    freshness: v.number(),
    exploration: v.number(),
    curriculum: v.number(),
    quality: v.number(),
    reports: v.number(),
  }),
});
/** Deterministic discovery within the newest 100 public/ok lesson candidates.
 * Not a global leaderboard. At most 20 cards; archived/missing publications
 * are excluded. Log-capped engagement prevents raw volume dominating;
 * freshness decays over seven days, low-view lessons get exploration credit.
 * `asOf` is caller-supplied display time, never an authorization/expiry input.
 */
export const rank = query({
  args: { asOf: v.number(), limit: v.number(), curriculumVersionId: v.optional(v.id("curriculumVersions")), nodeId: v.optional(v.id("curriculumNodes")) },
  returns: v.array(rankedLesson),
  handler: async (ctx, args) => {
    integer(args.asOf);
    integer(args.limit, 1);
    if (args.limit > 20) throw new Error("Ranking limit is 20");
    if (args.nodeId) {
      const node = await ctx.db.get("curriculumNodes", args.nodeId);
      if (!node || (args.curriculumVersionId && node.versionId !== args.curriculumVersionId)) throw new Error("Invalid curriculum node/version pair");
    }
    const candidates = await ctx.db
      .query("lessons")
      .withIndex("by_visibility_and_communityState", (q) =>
        q.eq("visibility", "public").eq("communityState", "ok"),
      )
      .order("desc")
      .take(100);
    const ranked = [];
    for (const lesson of candidates) {
      if (lesson.status !== "active" || !lesson.publishedVersionId || await creatorRestricted(ctx, lesson.ownerId)) continue;
      const version = await ctx.db.get(
        "lessonVersions",
        lesson.publishedVersionId,
      );
      if (!version || version.lessonId !== lesson._id) continue;
      if (version.visibility !== undefined && version.visibility !== "public") continue;
      const matchesCurriculum = (version.curriculumMappings ?? []).some(mapping => (!args.curriculumVersionId || mapping.versionId === args.curriculumVersionId) && (!args.nodeId || mapping.nodeId === args.nodeId));
      if ((args.curriculumVersionId || args.nodeId) && !matchesCurriculum) continue;
      const quality = await ctx.db.query("learnQuality").withIndex("by_lessonId_and_versionId", q => q.eq("lessonId", lesson._id).eq("versionId", version._id)).unique();
      const reports = await ctx.db.query("learnReports").withIndex("by_lessonId_and_status", q => q.eq("lessonId", lesson._id).eq("status", "open")).take(5);
      const row = await stats(ctx, lesson._id);
      const counts = {
        saves: row?.saves ?? 0,
        helpful: row?.helpful ?? 0,
        views: row?.views ?? 0,
      };
      const signals = {
        engagement: Math.min(
          10,
          Math.log1p(
            counts.saves * 2 + counts.helpful * 3 + counts.views * 0.1,
          ),
        ),
        freshness:
          2 / (1 + Math.max(0, args.asOf - version.publishedAt) / 604_800_000),
        exploration: 1 / (1 + counts.views),
        curriculum: (args.curriculumVersionId || args.nodeId) && matchesCurriculum ? 2 : 0,
        quality: quality?.status === "reviewed" ? 1 : quality?.status === "needs_changes" ? -2 : 0,
        reports: -0.25 * reports.length,
      };
      ranked.push({
        lessonId: lesson._id,
        versionId: version._id,
        metadata: version.metadata,
        counts,
        score: signals.engagement + signals.freshness + signals.exploration + signals.curriculum + signals.quality + signals.reports,
        signals,
      });
    }
    return ranked
      .sort(
        (a, b) =>
          b.score - a.score ||
          (a.lessonId < b.lessonId ? -1 : a.lessonId > b.lessonId ? 1 : 0),
      )
      .slice(0, args.limit);
  },
});
