import { v, ConvexError, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireActiveUser, creatorRestricted } from "./authz";
import { cards } from "./learnAssetModel";
import { visibility } from "./learnModel";
import schema from "./schema";
function validate(title: string, content: Infer<typeof cards>) {
  if (!title.trim() || title.length > 200 || content.length > 500 || new Set(content.map(c => c.id)).size !== content.length || content.some(c => !/^[A-Za-z0-9_-]{1,100}$/.test(c.id) || !c.front.trim() || !c.back.trim() || c.front.length > 2000 || c.back.length > 4000 || c.conceptIds.length > 20) || new TextEncoder().encode(JSON.stringify(content)).length > 300_000) throw new Error("Invalid flashcards or limits exceeded");
}
export const create = mutation({ args: { title: v.string(), cards }, returns: v.id("flashcardSets"), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); validate(args.title, args.cards);
  return ctx.db.insert("flashcardSets", { ...args, ownerId: identity.subject, revision: 0, visibility: "private", updatedAt: Date.now() });
} });
export const save = mutation({ args: { setId: v.id("flashcardSets"), expectedRevision: v.number(), title: v.string(), cards }, returns: v.number(), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); const row = await ctx.db.get("flashcardSets", args.setId);
  if (!row || row.ownerId !== identity.subject) throw new Error("Flashcards not found or unauthorized");
  if (!Number.isSafeInteger(args.expectedRevision) || row.revision !== args.expectedRevision) throw new ConvexError({ code: "REVISION_CONFLICT", currentRevision: row.revision });
  validate(args.title, args.cards);
  await ctx.db.patch("flashcardSets", row._id, { title: args.title, cards: args.cards, revision: row.revision + 1, updatedAt: Date.now() }); return row.revision + 1;
} });
export const publish = mutation({ args: { setId: v.id("flashcardSets"), expectedRevision: v.number(), visibility }, returns: v.id("flashcardVersions"), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); const row = await ctx.db.get("flashcardSets", args.setId);
  if (!row || row.ownerId !== identity.subject) throw new Error("Flashcards not found or unauthorized");
  if (!Number.isSafeInteger(args.expectedRevision) || row.revision !== args.expectedRevision) throw new ConvexError({ code: "REVISION_CONFLICT", currentRevision: row.revision });
  validate(row.title, row.cards); if (!row.cards.length) throw new Error("Cannot publish empty cards");
  const last = await ctx.db.query("flashcardVersions").withIndex("by_setId_and_number", q => q.eq("setId", row._id)).order("desc").first();
  const versionId = await ctx.db.insert("flashcardVersions", { setId: row._id, title: row.title, cards: row.cards, number: (last?.number ?? 0) + 1, publishedAt: Date.now() });
  await ctx.db.patch("flashcardSets", row._id, { publishedVersionId: versionId, visibility: args.visibility, revision: row.revision + 1, updatedAt: Date.now() }); return versionId;
} });
export const getPublished = query({ args: { setId: v.id("flashcardSets") }, returns: v.union(schema.doc("flashcardVersions"), v.null()), handler: async (ctx, args) => {
  const row = await ctx.db.get("flashcardSets", args.setId); const identity = await ctx.auth.getUserIdentity();
  if (!row || (row.ownerId !== identity?.subject && (row.visibility !== "public" || await creatorRestricted(ctx, row.ownerId)))) throw new Error("Flashcards not found or unauthorized");
  return row.publishedVersionId ? ctx.db.get("flashcardVersions", row.publishedVersionId) : null;
} });
export const fork = mutation({ args: { setId: v.id("flashcardSets"), versionId: v.id("flashcardVersions") }, returns: v.id("flashcardSets"), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); const row = await ctx.db.get("flashcardSets", args.setId);
  const version = await ctx.db.get("flashcardVersions", args.versionId);
  if (!row || !version || version.setId !== row._id || (row.ownerId !== identity.subject && (row.visibility !== "public" || row.publishedVersionId !== version._id || await creatorRestricted(ctx, row.ownerId)))) throw new Error("Flashcards not found or unauthorized");
  return ctx.db.insert("flashcardSets", { ownerId: identity.subject, title: version.title, cards: version.cards, revision: 0, visibility: "private", parentSetId: row._id, parentVersionId: version._id, originSetId: row.originSetId ?? row._id, updatedAt: Date.now() });
} });
