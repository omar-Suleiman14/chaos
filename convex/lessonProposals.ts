import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireActiveUser } from "./authz";
import { activeIntegrationToken, logConnectionActivity } from "./integrationModel";
import { lessonDocument, lessonMeta } from "./learnModel";
import { applyBlockOperations, saveLessonDraftForActor } from "./lessons";

const pendingView = v.object({
  id: v.id("lessonProposals"),
  lessonId: v.id("lessons"),
  lessonTitle: v.string(),
  connectionId: v.id("integrationTokens"),
  connectionLabel: v.string(),
  createdAt: v.number(),
  /** False when the lesson changed after the app read it: accepting then needs an explicit choice. */
  current: v.boolean(),
  draft: v.object({ metadata: lessonMeta, document: lessonDocument }),
  proposed: v.object({ metadata: lessonMeta, document: lessonDocument }),
});

/** The owner's pending connected-app updates, newest first (at most 50). */
export const listPending = query({
  args: {},
  returns: v.array(pendingView),
  handler: async (ctx) => {
    const { identity } = await requireActiveUser(ctx);
    const rows = await ctx.db.query("lessonProposals").withIndex("by_ownerId_and_status", q => q.eq("ownerId", identity.subject).eq("status", "pending")).order("desc").take(50);
    const out = [];
    for (const p of rows) {
      const lesson = await ctx.db.get("lessons", p.lessonId);
      const token = await ctx.db.get("integrationTokens", p.tokenId);
      if (!lesson || lesson.ownerId !== identity.subject || !token) continue;
      out.push({
        id: p._id, lessonId: p.lessonId, lessonTitle: lesson.metadata.title, connectionId: p.tokenId, connectionLabel: token.label, createdAt: p.createdAt,
        current: lesson.revision === p.baseRevision,
        draft: { metadata: lesson.metadata, document: lesson.draft },
        proposed: { metadata: p.metadata ?? lesson.metadata, document: p.document },
      });
    }
    return out;
  },
});

async function ownedPending(ctx: Parameters<typeof requireActiveUser>[0], proposalId: Doc<"lessonProposals">["_id"]) {
  const { identity } = await requireActiveUser(ctx);
  const p = await ctx.db.get("lessonProposals", proposalId);
  if (!p || p.ownerId !== identity.subject) throw new Error("NOT_FOUND: Change not found.");
  if (p.status !== "pending") throw new Error("ALREADY_DECIDED: This change was already accepted or rejected.");
  return { p, owner: identity.subject };
}

/**
 * Apply a pending change. If the lesson changed since the app read it, `onTop` must be set:
 * block edits are re-applied to the current draft; a full replacement overwrites it (the
 * previous draft stays in draft recovery).
 */
export const accept = mutation({
  args: { proposalId: v.id("lessonProposals"), onTop: v.optional(v.boolean()) },
  returns: v.object({ revision: v.number() }),
  handler: async (ctx, args) => {
    const { p, owner } = await ownedPending(ctx, args.proposalId);
    const lesson = await ctx.db.get("lessons", p.lessonId);
    if (!lesson) throw new Error("NOT_FOUND: Lesson not found.");
    const stale = lesson.revision !== p.baseRevision;
    if (stale && !args.onTop) throw new Error("REVISION_CONFLICT: The lesson changed after this update was sent. Choose whether to apply it anyway.");
    const document = stale && p.operations ? { schemaVersion: 1 as const, blocks: applyBlockOperations(lesson.draft.blocks, p.operations) } : p.document;
    const revision = await saveLessonDraftForActor(ctx, owner, { lessonId: p.lessonId, expectedRevision: lesson.revision, document, metadata: p.metadata });
    await ctx.db.patch("lessonProposals", p._id, { status: "accepted", decidedAt: Date.now() });
    await logConnectionActivity(ctx, p.tokenId, "lesson.draft_updated", `lesson_${p.lessonId}`);
    return { revision };
  },
});

export const reject = mutation({
  args: { proposalId: v.id("lessonProposals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { p } = await ownedPending(ctx, args.proposalId);
    await ctx.db.patch("lessonProposals", p._id, { status: "rejected", decidedAt: Date.now() });
    return null;
  },
});

/** Owner switch: hold this connection's lesson updates for review instead of saving them directly. */
export const setReviewMode = mutation({
  args: { tokenId: v.id("integrationTokens"), review: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const token = await activeIntegrationToken(ctx, args.tokenId, Date.now());
    if (!token || token.ownerId !== identity.subject) throw new Error("NOT_FOUND: Active connection not found.");
    await ctx.db.patch("integrationTokens", token._id, { reviewLessonUpdates: args.review });
    return null;
  },
});
