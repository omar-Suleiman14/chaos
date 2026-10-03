import { authorDb } from "./authorIndex";
import { courseSearchText } from "./courseSearchModel";
import { enqueueLearnWebhookEvent } from "./learnWebhookEvents";
import { recordAssetPublicationAction } from "./learnPublicationAudit";
import { v, ConvexError } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireActiveUser } from "./authz";
import { requireVisibilityAllowed } from "./plans";
import { collectionItem } from "./learnAssetModel";
import { lessonMeta, visibility } from "./learnModel";
import { lessonAccess, lessonAccessForActor, metadataCheck } from "./lessons";
import { creatorRestricted } from "./authz";
import schema from "./schema";
import type { Id, Doc } from "./_generated/dataModel";

async function owned(ctx: MutationCtx | QueryCtx, id: Id<"learnCollections">) {
  const { identity } = await requireActiveUser(ctx); const row = await ctx.db.get("learnCollections", id);
  if (!row || row.ownerId !== identity.subject) throw new Error("Collection not found or unauthorized"); return row;
}
function revision(row: Doc<"learnCollections">, expected: number) {
  if (!Number.isSafeInteger(expected) || row.revision !== expected) throw new ConvexError({ code: "REVISION_CONFLICT", currentRevision: row.revision, expectedRevision: expected });
}
export const create = mutation({ args: { metadata: lessonMeta }, returns: v.id("learnCollections"), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx);
  // Same checks as lesson metadata: safe cover links, bounded icon, author, language, tags and licence.
  metadataCheck(args.metadata);
  const collectionId = await authorDb(ctx).insert("learnCollections", { ownerId: identity.subject, metadata: args.metadata, items: [], revision: 0, visibility: "private", communityState: "ok", createdAt: Date.now(), updatedAt: Date.now() });
  await recordAssetPublicationAction(ctx, { asset: { kind: "collection", id: collectionId }, actorId: identity.subject, action: "create", revision: 0, afterVisibility: "private", reason: "Created a private ordered collection draft." });
  return collectionId;
} });
export const replaceItems = mutation({ args: { collectionId: v.id("learnCollections"), expectedRevision: v.number(), items: v.array(collectionItem) }, returns: v.number(), handler: async (ctx, args) => {
  const row = await owned(ctx, args.collectionId); revision(row, args.expectedRevision);
  if (args.items.length > 100 || new Set(args.items.map(i => `${i.kind}:${i.id}`)).size !== args.items.length) throw new Error("Collection supports at most 100 distinct items");
  for (const item of args.items) {
    if (item.kind === "lesson") {
      const lesson = await lessonAccess(ctx, item.id); const version = await ctx.db.get("lessonVersions", item.versionId);
      if (!version || version.lessonId !== lesson._id || (lesson.ownerId !== row.ownerId && lesson.publishedVersionId !== item.versionId)) throw new Error("Lesson version inaccessible");
    } else {
      const source = await ctx.db.get("learnSources", item.id);
      if (!source || source.status !== "active" || (source.ownerId !== row.ownerId && source.metadataVisibility !== "public")) throw new Error("Source metadata inaccessible");
    }
  }
  await authorDb(ctx).patch("learnCollections", row._id, { items: args.items, revision: row.revision + 1, updatedAt: Date.now() }); await enqueueLearnWebhookEvent(ctx, { event: "collection.updated", collectionId: row._id, operationId: `revision:${row.revision + 1}`, revision: row.revision + 1 }); return row.revision + 1;
} });
export const publish = mutation({ args: { collectionId: v.id("learnCollections"), expectedRevision: v.number(), visibility }, returns: v.id("collectionVersions"), handler: async (ctx, args) => {
  const row = await owned(ctx, args.collectionId); revision(row, args.expectedRevision);
  await requireVisibilityAllowed(ctx, row.ownerId, args.visibility);
  if (!row.items.length || row.communityState !== "ok") throw new Error("Collection is empty or moderated");
  for (const item of row.items) {
    if (item.kind === "lesson") { const lesson = await ctx.db.get("lessons", item.id); if (!lesson || lesson.visibility !== "public" || lesson.status !== "active" || lesson.communityState !== "ok" || lesson.publishedVersionId !== item.versionId) throw new Error("Collection references an unavailable lesson version"); }
    else { const source = await ctx.db.get("learnSources", item.id); if (!source || source.metadataVisibility !== "public" || source.status !== "active") throw new Error("Collection references unavailable source metadata"); }
  }
  const last = await ctx.db.query("collectionVersions").withIndex("by_collectionId_and_number", q => q.eq("collectionId", row._id)).order("desc").first();
  const versionId = await ctx.db.insert("collectionVersions", { collectionId: row._id, number: (last?.number ?? 0) + 1, metadata: row.metadata, items: row.items, publishedAt: Date.now() });
  await authorDb(ctx).patch("learnCollections", row._id, { searchText: await courseSearchText(ctx, row.ownerId, row.metadata, row.items), publishedVersionId: versionId, visibility: args.visibility, revision: row.revision + 1, updatedAt: Date.now() }); await enqueueLearnWebhookEvent(ctx, { event: "collection.published", collectionId: row._id, versionId, operationId: `version:${versionId}`, revision: row.revision + 1 });
  await recordAssetPublicationAction(ctx, { asset: { kind: "collection", id: row._id }, actorId: row.ownerId, action: "publish", revision: row.revision + 1, versionId, beforeVisibility: row.visibility, afterVisibility: args.visibility, reason: "Published an immutable ordered collection snapshot." });
  return versionId;
} });
export const getDraft = query({ args: { collectionId: v.id("learnCollections") }, returns: schema.doc("learnCollections"), handler: (ctx, args) => owned(ctx, args.collectionId) });
export const getPublished = query({ args: { collectionId: v.id("learnCollections") }, returns: v.union(schema.doc("collectionVersions"), v.null()), handler: async (ctx, args) => {
  const row = await ctx.db.get("learnCollections", args.collectionId); const identity = await ctx.auth.getUserIdentity();
  if (!row || (row.ownerId !== identity?.subject && (row.visibility !== "public" || row.communityState !== "ok" || row.archived || await creatorRestricted(ctx, row.ownerId)))) throw new Error("Collection not found or unauthorized");
  // Returns IDs and metadata only. Linked lesson/source reads still enforce current access.
  return row.publishedVersionId ? ctx.db.get("collectionVersions", row.publishedVersionId) : null;
} });
export async function attachAssessmentForActor(ctx: MutationCtx, actor: string, args: { lessonId: Id<"lessons">; asset: Doc<"lessonAssessments">["asset"]; label: string; order: number }) {
  const lesson = await lessonAccessForActor(ctx, actor, args.lessonId, true);
  if (lesson.ownerId !== actor || !args.label.trim() || args.label.length > 200 || !Number.isSafeInteger(args.order) || args.order < 0 || args.order > 1000) throw new Error("Invalid assessment relationship");
  if (args.asset.kind === "form") { const form = await ctx.db.get("forms", args.asset.id); if (!form || form.ownerId !== actor || !form.draft.quiz?.enabled) throw new Error("Assessment must be an owned quiz form"); }
  else { const quiz = await ctx.db.get("quizzes", args.asset.id); if (!quiz || quiz.creatorId !== actor) throw new Error("Assessment must be an owned quiz"); }
  const prior = await ctx.db.query("lessonAssessments").withIndex("by_lessonId_and_asset", q => q.eq("lessonId", lesson._id).eq("asset", args.asset)).unique();
  if (prior) { await ctx.db.patch("lessonAssessments", prior._id, { label: args.label, order: args.order }); return prior._id; }
  if ((await ctx.db.query("lessonAssessments").withIndex("by_lessonId_and_order", q => q.eq("lessonId", lesson._id)).take(51)).length >= 50) throw new Error("At most 50 assessments per lesson");
  return ctx.db.insert("lessonAssessments", args);
}
export const attachAssessment = mutation({ args: { lessonId: v.id("lessons"), asset: schema.tables.lessonAssessments.validator.fields.asset, label: v.string(), order: v.number() }, returns: v.id("lessonAssessments"), handler: async (ctx, args) => attachAssessmentForActor(ctx, (await requireActiveUser(ctx)).identity.subject, args) });
export const listAssessments = query({ args: { lessonId: v.id("lessons") }, returns: v.array(schema.doc("lessonAssessments")), handler: async (ctx, args) => {
  // Editors only: the list includes unpublished and private attachments. Readers use learnFrontend.attachedQuizzes.
  await lessonAccess(ctx, args.lessonId, true); return ctx.db.query("lessonAssessments").withIndex("by_lessonId_and_order", q => q.eq("lessonId", args.lessonId)).take(50); } });
