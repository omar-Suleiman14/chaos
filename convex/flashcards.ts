import { getAuthIdentity } from "./authIdentity";
import { v, ConvexError, type Infer } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireActiveUser, creatorRestricted } from "./authz";
import { cards } from "./learnAssetModel";
import { visibility } from "./learnModel";
import schema from "./schema";
import { recordAssetPublicationAction } from "./learnPublicationAudit";
function validate(title: string, content: Infer<typeof cards>) {
  if (!title.trim() || title.length > 200 || content.length > 500 || new Set(content.map(c => c.id)).size !== content.length || content.some(c => !/^[A-Za-z0-9_-]{1,100}$/.test(c.id) || !c.front.trim() || !c.back.trim() || c.front.length > 2000 || c.back.length > 4000 || c.conceptIds.length > 20) || new TextEncoder().encode(JSON.stringify(content)).length > 300_000) throw new Error("VALIDATION_FAILED: Invalid flashcards or limits exceeded");
}
const NOT_FOUND = "NOT_FOUND: Flashcards not found or unauthorized";
const checkRevision = (current: number, expected: number) => { if (!Number.isSafeInteger(expected) || current !== expected) throw new ConvexError({ code: "REVISION_CONFLICT", currentRevision: current }); };
type Visibility = Infer<typeof visibility>;
type Lifecycle = "archive" | "restore" | "unpublish";

// Shared by the signed-in app and the ChatGPT app; `actor` is always a server-verified user id.
export async function createFlashcardSet(ctx: MutationCtx, actor: string, args: { title: string; cards: Infer<typeof cards> }) {
  validate(args.title, args.cards);
  const setId = await ctx.db.insert("flashcardSets", { title: args.title, cards: args.cards, ownerId: actor, revision: 0, visibility: "private", updatedAt: Date.now() });
  await recordAssetPublicationAction(ctx, { asset: { kind: "flashcards", id: setId }, actorId: actor, action: "create", revision: 0, afterVisibility: "private", reason: "Created an editable private flashcard set." });
  return setId;
}
export async function saveFlashcardSet(ctx: MutationCtx, actor: string, args: { setId: Id<"flashcardSets">; expectedRevision: number; title: string; cards: Infer<typeof cards> }) {
  const row = await ctx.db.get("flashcardSets", args.setId);
  if (!row || row.archived || row.ownerId !== actor) throw new Error(NOT_FOUND);
  checkRevision(row.revision, args.expectedRevision);
  validate(args.title, args.cards);
  await ctx.db.patch("flashcardSets", row._id, { title: args.title, cards: args.cards, revision: row.revision + 1, updatedAt: Date.now() }); return row.revision + 1;
}
export async function publishFlashcardSet(ctx: MutationCtx, actor: string, args: { setId: Id<"flashcardSets">; expectedRevision: number; visibility: Visibility }) {
  const row = await ctx.db.get("flashcardSets", args.setId);
  if (!row || row.ownerId !== actor) throw new Error(NOT_FOUND);
  checkRevision(row.revision, args.expectedRevision);
  validate(row.title, row.cards); if (!row.cards.length) throw new Error("EMPTY: Cannot publish empty cards");
  const last = await ctx.db.query("flashcardVersions").withIndex("by_setId_and_number", q => q.eq("setId", row._id)).order("desc").first();
  const versionId = await ctx.db.insert("flashcardVersions", { setId: row._id, title: row.title, cards: row.cards, number: (last?.number ?? 0) + 1, publishedAt: Date.now() });
  await ctx.db.patch("flashcardSets", row._id, { publishedVersionId: versionId, visibility: args.visibility, revision: row.revision + 1, updatedAt: Date.now() });
  await recordAssetPublicationAction(ctx, { asset: { kind: "flashcards", id: row._id }, actorId: actor, action: "publish", revision: row.revision + 1, versionId, beforeVisibility: row.visibility, afterVisibility: args.visibility, reason: "Published an immutable flashcard version." });
  return versionId;
}
export async function setFlashcardLifecycle(ctx: MutationCtx, actor: string, args: { setId: Id<"flashcardSets">; expectedRevision: number; action: Lifecycle }) {
  const row = await ctx.db.get("flashcardSets", args.setId);
  if (!row || row.ownerId !== actor) throw new Error(NOT_FOUND);
  checkRevision(row.revision, args.expectedRevision);
  await ctx.db.patch("flashcardSets", row._id, { ...(args.action === "unpublish" ? { visibility: "private" as const, publishedVersionId: undefined } : { archived: args.action === "archive" }), revision: row.revision + 1, updatedAt: Date.now() });
  await recordAssetPublicationAction(ctx, { asset: { kind: "flashcards", id: row._id }, actorId: actor, action: args.action === "restore" ? "reactivate" : args.action, revision: row.revision + 1, ...(row.publishedVersionId ? { versionId: row.publishedVersionId } : {}), beforeVisibility: row.visibility, afterVisibility: args.action === "unpublish" ? "private" : row.visibility, reason: `Owner requested ${args.action}; immutable history is retained.` });
  return row.revision + 1;
}

export const create = mutation({ args: { title: v.string(), cards }, returns: v.id("flashcardSets"), handler: async (ctx, args) => createFlashcardSet(ctx, (await requireActiveUser(ctx)).identity.subject, args) });
export const save = mutation({ args: { setId: v.id("flashcardSets"), expectedRevision: v.number(), title: v.string(), cards }, returns: v.number(), handler: async (ctx, args) => saveFlashcardSet(ctx, (await requireActiveUser(ctx)).identity.subject, args) });
export const publish = mutation({ args: { setId: v.id("flashcardSets"), expectedRevision: v.number(), visibility }, returns: v.id("flashcardVersions"), handler: async (ctx, args) => publishFlashcardSet(ctx, (await requireActiveUser(ctx)).identity.subject, args) });
export const getPublished = query({ args: { setId: v.id("flashcardSets") }, returns: v.union(schema.doc("flashcardVersions"), v.null()), handler: async (ctx, args) => {
  const row = await ctx.db.get("flashcardSets", args.setId); const identity = await getAuthIdentity(ctx);
  if (!row || row.archived || (row.ownerId !== identity?.subject && (row.visibility !== "public" || await creatorRestricted(ctx, row.ownerId)))) throw new Error("Flashcards not found or unauthorized");
  return row.publishedVersionId ? ctx.db.get("flashcardVersions", row.publishedVersionId) : null;
} });
export const fork = mutation({ args: { setId: v.id("flashcardSets"), versionId: v.id("flashcardVersions") }, returns: v.id("flashcardSets"), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); const row = await ctx.db.get("flashcardSets", args.setId);
  const version = await ctx.db.get("flashcardVersions", args.versionId);
  if (!row || row.archived || !version || version.setId !== row._id || (row.ownerId !== identity.subject && (row.visibility !== "public" || row.publishedVersionId !== version._id || await creatorRestricted(ctx, row.ownerId)))) throw new Error("Flashcards not found or unauthorized");
  const setId = await ctx.db.insert("flashcardSets", { ownerId: identity.subject, title: version.title, cards: version.cards, revision: 0, visibility: "private", parentSetId: row._id, parentVersionId: version._id, originSetId: row.originSetId ?? row._id, updatedAt: Date.now() });
  await recordAssetPublicationAction(ctx, { asset: { kind: "flashcards", id: setId }, actorId: identity.subject, action: "fork", revision: 0, versionId: version._id, afterVisibility: "private", reason: `Forked immutable parent version ${version._id}; lineage and parent history remain intact.` });
  return setId;
} });

export const setLifecycle = mutation({
  args: { setId: v.id("flashcardSets"), expectedRevision: v.number(), action: v.union(v.literal("archive"), v.literal("restore"), v.literal("unpublish")) },
  returns: v.number(),
  handler: async (ctx, args) => setFlashcardLifecycle(ctx, (await requireActiveUser(ctx)).identity.subject, args),
});
