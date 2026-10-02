import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireActiveUser, creatorRestricted } from "./authz";
import schema from "./schema";
import { consumeRate } from "./serverUtils";

const rating = v.union(v.literal("again"), v.literal("hard"), v.literal("good"), v.literal("easy"));
const DAY = 86_400_000;
async function accessibleVersion(ctx: QueryCtx | MutationCtx, versionId: Id<"flashcardVersions">, actor: string) {
  const version = await ctx.db.get("flashcardVersions", versionId);
  const set = version && await ctx.db.get("flashcardSets", version.setId);
  if (!version || !set || set.archived || (set.ownerId !== actor && (set.visibility !== "public" || set.publishedVersionId !== versionId || await creatorRestricted(ctx, set.ownerId)))) throw new Error("NOT_FOUND: Flashcards not found or unauthorized");
  return version;
}
/** Self-reported retrieval evidence, never server-graded concept mastery. */
export const review = mutation({
  args: { versionId: v.id("flashcardVersions"), cardId: v.string(), rating, eventId: v.string(), expectedRevision: v.number() },
  returns: v.object({ revision: v.number(), dueAt: v.number(), box: v.number(), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(args.eventId) || !Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0) throw new Error("Invalid event ID or revision");
    const version = await accessibleVersion(ctx, args.versionId, identity.subject);
    if (!version.cards.some(c => c.id === args.cardId)) throw new Error("Card not found in this version");
    const prior = await ctx.db.query("flashcardStudyEvidence").withIndex("by_userKey_and_eventId", q => q.eq("userKey", identity.tokenIdentifier).eq("eventId", args.eventId)).unique();
    if (prior) {
      if (prior.versionId !== args.versionId || prior.cardId !== args.cardId || prior.rating !== args.rating || prior.resultingRevision !== args.expectedRevision + 1) throw new Error("Event ID reused for a different review");
      return { revision: prior.resultingRevision, dueAt: prior.dueAt, box: prior.box, replayed: true };
    }
    const state = await ctx.db.query("flashcardStudyState").withIndex("by_userKey_and_versionId_and_cardId", q => q.eq("userKey", identity.tokenIdentifier).eq("versionId", args.versionId).eq("cardId", args.cardId)).unique();
    if ((state?.revision ?? 0) !== args.expectedRevision) throw new ConvexError({ code: "REVISION_CONFLICT", currentRevision: state?.revision ?? 0, dueAt: state?.dueAt ?? null });
    const now = Date.now();
    if (state && now - state.lastReviewedAt < 1000) throw new Error("Wait before recording another review of this card");
    await consumeRate(ctx, `flashcards:review:${identity.tokenIdentifier}`, 120, 60_000);
    const box = args.rating === "again" ? 0 : args.rating === "hard" ? Math.max(0, (state?.box ?? 0) - 1) : Math.min(5, (state?.box ?? 0) + (args.rating === "easy" ? 2 : 1));
    const dueAt = now + (args.rating === "again" ? 10 * 60_000 : args.rating === "hard" ? DAY : [1, 1, 3, 7, 14, 30][box] * DAY);
    const next = { userKey: identity.tokenIdentifier, versionId: args.versionId, cardId: args.cardId, revision: args.expectedRevision + 1, reviews: (state?.reviews ?? 0) + 1, lapses: (state?.lapses ?? 0) + Number(args.rating === "again"), box, dueAt, lastReviewedAt: now };
    if (state) await ctx.db.patch("flashcardStudyState", state._id, next); else await ctx.db.insert("flashcardStudyState", next);
    await ctx.db.insert("flashcardStudyEvidence", { userKey: identity.tokenIdentifier, eventId: args.eventId, versionId: args.versionId, cardId: args.cardId, rating: args.rating, reviewedAt: now, resultingRevision: next.revision, dueAt, box });
    return { revision: next.revision, dueAt, box, replayed: false };
  },
});
export const reviewSchedule = query({
  args: { versionId: v.id("flashcardVersions"), now: v.number(), limit: v.optional(v.number()) },
  returns: v.object({ evidenceKind: v.literal("self_reported"), items: v.array(v.object({ cardId: v.string(), revision: v.number(), reviews: v.number(), lapses: v.number(), box: v.number(), dueAt: v.union(v.number(), v.null()), due: v.boolean() })) }),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    if (!Number.isFinite(args.now) || args.now < 0 || !Number.isInteger(args.limit ?? 50) || (args.limit ?? 50) < 1 || (args.limit ?? 50) > 100) throw new Error("Use a valid display clock and limit 1–100");
    const version = await accessibleVersion(ctx, args.versionId, identity.subject);
    const rows = await ctx.db.query("flashcardStudyState").withIndex("by_userKey_and_versionId_and_cardId", q => q.eq("userKey", identity.tokenIdentifier).eq("versionId", args.versionId)).take(500);
    const states = new Map(rows.map(r => [r.cardId, r]));
    const items = version.cards.map(card => {
      const state = states.get(card.id);
      return { cardId: card.id, revision: state?.revision ?? 0, reviews: state?.reviews ?? 0, lapses: state?.lapses ?? 0, box: state?.box ?? 0, dueAt: state?.dueAt ?? null, due: !state || state.dueAt <= args.now };
    }).sort((a, b) => Number(b.due) - Number(a.due) || (a.dueAt ?? 0) - (b.dueAt ?? 0)).slice(0, args.limit ?? 50);
    return { evidenceKind: "self_reported" as const, items };
  },
});
export const history = query({
  args: { versionId: v.id("flashcardVersions"), before: v.optional(v.number()) },
  returns: v.array(schema.doc("flashcardStudyEvidence")),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    await accessibleVersion(ctx, args.versionId, identity.subject);
    if (args.before !== undefined && !Number.isFinite(args.before)) throw new Error("Invalid history boundary");
    return ctx.db.query("flashcardStudyEvidence").withIndex("by_userKey_and_versionId_and_reviewedAt", q => { const range = q.eq("userKey", identity.tokenIdentifier).eq("versionId", args.versionId); return args.before === undefined ? range : range.lt("reviewedAt", args.before); }).order("desc").take(100);
  },
});
// Shared by the signed-in app and the ChatGPT app; `actor` is always a server-verified user id.
export async function attachFlashcardsForActor(ctx: MutationCtx, actor: string, args: { lessonId: Id<"lessons">; versionId: Id<"flashcardVersions">; label: string; order: number }) {
  const lesson = await ctx.db.get("lessons", args.lessonId);
  if (!lesson || lesson.ownerId !== actor || lesson.status !== "active") throw new Error("NOT_FOUND: Lesson not found or unauthorized");
  if (args.label.length > 200 || !Number.isSafeInteger(args.order) || args.order < 0 || args.order > 1000) throw new Error("VALIDATION_FAILED: Invalid attachment label/order");
  const version = await accessibleVersion(ctx, args.versionId, actor);
  const prior = await ctx.db.query("lessonFlashcards").withIndex("by_lessonId_and_setId", q => q.eq("lessonId", args.lessonId).eq("setId", version.setId)).unique();
  if (prior) { await ctx.db.patch("lessonFlashcards", prior._id, { versionId: args.versionId, label: args.label, order: args.order }); return prior._id; }
  const count = await ctx.db.query("lessonFlashcards").withIndex("by_lessonId_and_order", q => q.eq("lessonId", args.lessonId)).take(51);
  if (count.length >= 50) throw new Error("VALIDATION_FAILED: At most 50 flashcard attachments");
  return ctx.db.insert("lessonFlashcards", { lessonId: args.lessonId, versionId: args.versionId, label: args.label, order: args.order, setId: version.setId });
}
export async function detachFlashcardsForActor(ctx: MutationCtx, actor: string, attachmentId: Id<"lessonFlashcards">) {
  const attachment = await ctx.db.get("lessonFlashcards", attachmentId);
  if (!attachment) return null;
  const lesson = await ctx.db.get("lessons", attachment.lessonId);
  if (!lesson || lesson.ownerId !== actor) throw new Error("NOT_FOUND: Lesson not found or unauthorized");
  await ctx.db.delete("lessonFlashcards", attachment._id);
  return null;
}
export const attachedFlashcards = v.array(v.object({ attachmentId: v.id("lessonFlashcards"), setId: v.id("flashcardSets"), versionId: v.id("flashcardVersions"), title: v.string(), label: v.string(), order: v.number(), cardCount: v.number() }));
/** `viewer` is the signed-in subject (or verified MCP actor); undefined for anonymous readers. */
export async function listAttachedFlashcards(ctx: QueryCtx, viewer: string | undefined, lessonId: Id<"lessons">) {
  const lesson = await ctx.db.get("lessons", lessonId);
  if (!lesson || lesson.status !== "active") throw new Error("NOT_FOUND: Lesson not found or unauthorized");
  const owner = viewer !== undefined && lesson.ownerId === viewer;
  const grant = viewer !== undefined && await ctx.db.query("lessonPermissions").withIndex("by_lessonId_and_userId", q => q.eq("lessonId", lessonId).eq("userId", viewer)).unique();
  if (!owner && !grant && (lesson.visibility !== "public" || lesson.communityState !== "ok" || !lesson.publishedVersionId || await creatorRestricted(ctx, lesson.ownerId))) throw new Error("NOT_FOUND: Lesson not found or unauthorized");
  const rows = await ctx.db.query("lessonFlashcards").withIndex("by_lessonId_and_order", q => q.eq("lessonId", lessonId)).take(50);
  const result = [];
  for (const row of rows) {
    try {
      const version = await accessibleVersion(ctx, row.versionId, viewer ?? "");
      result.push({ attachmentId: row._id, setId: row.setId, versionId: row.versionId, title: version.title, label: row.label, order: row.order, cardCount: version.cards.length });
    } catch { /* Revoked/private attachments expose no metadata. */ }
  }
  return result;
}
export const attach = mutation({
  args: { lessonId: v.id("lessons"), versionId: v.id("flashcardVersions"), label: v.string(), order: v.number() },
  returns: v.id("lessonFlashcards"),
  handler: async (ctx, args) => attachFlashcardsForActor(ctx, (await requireActiveUser(ctx)).identity.subject, args),
});
export const detach = mutation({
  args: { attachmentId: v.id("lessonFlashcards") },
  returns: v.null(),
  handler: async (ctx, args) => detachFlashcardsForActor(ctx, (await requireActiveUser(ctx)).identity.subject, args.attachmentId),
});
export const listAttached = query({
  args: { lessonId: v.id("lessons") },
  returns: attachedFlashcards,
  handler: async (ctx, args) => listAttachedFlashcards(ctx, (await ctx.auth.getUserIdentity())?.subject, args.lessonId),
});
