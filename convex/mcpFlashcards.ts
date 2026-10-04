// Actor comes only from the secret-protected MCP envelope; every handler rechecks it with requireLearnActor.
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireLearnActor } from "./mcpLearn";
import { cards } from "./learnAssetModel";
import { visibility } from "./learnModel";
import { createFlashcardSet, saveFlashcardSet, publishFlashcardSet, setFlashcardLifecycle } from "./flashcards";
import { attachFlashcardsForActor, detachFlashcardsForActor, listAttachedFlashcards, attachedFlashcards } from "./flashcardStudy";
const actor = { userId: v.string() };
const edit = { ...actor, setId: v.id("flashcardSets"), expectedRevision: v.number() };
const status = { revision: v.number(), visibility, publishedVersionId: v.union(v.id("flashcardVersions"), v.null()), archived: v.boolean(), updatedAt: v.number() };
const setCard = v.object({ setId: v.id("flashcardSets"), title: v.string(), cardCount: v.number(), ...status });
const toCard = (r: Doc<"flashcardSets">) => ({ setId: r._id, title: r.title, cardCount: r.cards.length, revision: r.revision, visibility: r.visibility, publishedVersionId: r.publishedVersionId ?? null, archived: !!r.archived, updatedAt: r.updatedAt });
export const list = internalQuery({ args: { ...actor, limit: v.optional(v.number()), cursor: v.optional(v.string()) }, returns: v.object({ sets: v.array(setCard), nextCursor: v.union(v.string(), v.null()) }), handler: async (ctx, { userId, limit = 20, cursor }) => {
  const owner = await requireLearnActor(ctx, userId);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (cursor?.length ?? 0) > 2000) throw new Error("VALIDATION_FAILED: Use a limit from 1 to 50 and a cursor from the previous page.");
  const page = await ctx.db.query("flashcardSets").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", owner)).order("desc").paginate({ numItems: limit, cursor: cursor ?? null });
  return { sets: page.page.map(toCard), nextCursor: page.isDone ? null : page.continueCursor };
} });
export const get = internalQuery({ args: { ...actor, setId: v.id("flashcardSets") }, returns: v.object({ setId: v.id("flashcardSets"), title: v.string(), cardCount: v.number(), cards, ...status }), handler: async (ctx, args) => {
  const owner = await requireLearnActor(ctx, args.userId), row = await ctx.db.get("flashcardSets", args.setId);
  if (!row || row.ownerId !== owner) throw new Error("NOT_FOUND: Flashcards not found or unauthorized");
  return { ...toCard(row), cards: row.cards };
} });
export const create = internalMutation({ args: { ...actor, title: v.string(), cards }, returns: v.object({ setId: v.id("flashcardSets"), revision: v.number() }), handler: async (ctx, { userId, ...input }) => ({ setId: await createFlashcardSet(ctx, await requireLearnActor(ctx, userId), input), revision: 0 }) });
export const save = internalMutation({ args: { ...edit, title: v.string(), cards }, returns: v.object({ revision: v.number() }), handler: async (ctx, { userId, ...input }) => ({ revision: await saveFlashcardSet(ctx, await requireLearnActor(ctx, userId), input) }) });
export const publish = internalMutation({ args: { ...edit, visibility, teamId: v.optional(v.id("businessTeams")) }, returns: v.object({ versionId: v.id("flashcardVersions"), revision: v.number() }), handler: async (ctx, { userId, ...input }) => ({ versionId: await publishFlashcardSet(ctx, await requireLearnActor(ctx, userId), input), revision: input.expectedRevision + 1 }) });
export const lifecycle = internalMutation({ args: { ...edit, action: v.union(v.literal("archive"), v.literal("restore"), v.literal("unpublish")) }, returns: v.object({ revision: v.number() }), handler: async (ctx, { userId, ...input }) => ({ revision: await setFlashcardLifecycle(ctx, await requireLearnActor(ctx, userId), input) }) });
export const attach = internalMutation({ args: { ...actor, lessonId: v.id("lessons"), versionId: v.id("flashcardVersions"), label: v.string(), order: v.number() }, returns: v.object({ attachmentId: v.id("lessonFlashcards") }), handler: async (ctx, { userId, ...input }) => ({ attachmentId: await attachFlashcardsForActor(ctx, await requireLearnActor(ctx, userId), input) }) });
export const detach = internalMutation({ args: { ...actor, attachmentId: v.id("lessonFlashcards") }, returns: v.object({ ok: v.boolean() }), handler: async (ctx, args) => { await detachFlashcardsForActor(ctx, await requireLearnActor(ctx, args.userId), args.attachmentId); return { ok: true }; } });
export const listAttached = internalQuery({ args: { ...actor, lessonId: v.id("lessons") }, returns: v.object({ attachments: attachedFlashcards }), handler: async (ctx, args) => ({ attachments: await listAttachedFlashcards(ctx, await requireLearnActor(ctx, args.userId), args.lessonId) }) });
