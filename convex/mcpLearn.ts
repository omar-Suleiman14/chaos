// userId is supplied only by the secret-protected OAuth transport.
import { v } from "convex/values";
import { learnCapabilityLimits, mcpToolGroups } from "./learnCapabilityModel";
import { internalMutation, internalQuery, type QueryCtx, type MutationCtx } from "./_generated/server";
import { LEARN_LIMITS, lessonBlock, lessonDocument, lessonMeta, sourceMetadata, visibility } from "./learnModel";
import { creatorRestricted } from "./authz";
import { lessonAccessForActor, createLessonForActor, saveLessonDraftForActor, publishLessonForActor, restoreLessonVersionForActor, setLessonLifecycleForActor, forkLessonForActor, editLessonBlocksForActor, readLessonForActor, summarizeLesson, lessonSummary, lessonReadResult, lessonBlockOperation } from "./lessons";

export async function requireLearnActor(ctx: QueryCtx | MutationCtx, userId: string) {
  const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", userId)).first();
  if (!user) throw new Error("ACCOUNT_REQUIRED: Sign in to Chaos first.");
  if (user.isBanned || user.suspendedUntil) throw new Error("ACCOUNT_RESTRICTED: This Chaos account is read-only.");
  return userId;
}
const actor = { userId: v.string() };
const edit = { ...actor, lessonId: v.id("lessons"), expectedRevision: v.number() };
const problem = v.object({ path: v.string(), code: v.string(), message: v.string() });
export const createLesson = internalMutation({ args: { ...actor, metadata: lessonMeta, document: v.optional(lessonDocument) }, returns: v.object({ lessonId: v.id("lessons"), revision: v.number() }), handler: async (ctx, args) => ({ lessonId: await createLessonForActor(ctx, await requireLearnActor(ctx, args.userId), args), revision: 0 }) });
export const saveLesson = internalMutation({ args: { ...edit, document: lessonDocument, metadata: v.optional(lessonMeta) }, returns: v.object({ revision: v.number() }), handler: async (ctx, args) => ({ revision: await saveLessonDraftForActor(ctx, await requireLearnActor(ctx, args.userId), args) }) });
export const editBlocks = internalMutation({ args: { ...edit, operations: v.array(lessonBlockOperation) }, returns: v.object({ revision: v.number() }), handler: async (ctx, args) => ({ revision: await editLessonBlocksForActor(ctx, await requireLearnActor(ctx, args.userId), args) }) });
export const publishLesson = internalMutation({ args: { ...edit, visibility, note: v.optional(v.string()) }, returns: v.union(v.object({ ok: v.literal(false), problems: v.array(problem) }), v.object({ ok: v.literal(true), versionId: v.id("lessonVersions"), revision: v.number() })), handler: async (ctx, args) => publishLessonForActor(ctx, await requireLearnActor(ctx, args.userId), args) });
export const restoreLesson = internalMutation({ args: { ...edit, versionId: v.id("lessonVersions") }, returns: v.object({ revision: v.number() }), handler: async (ctx, args) => ({ revision: await restoreLessonVersionForActor(ctx, await requireLearnActor(ctx, args.userId), args) }) });
export const lifecycle = internalMutation({ args: { ...edit, action: v.union(v.literal("archive"), v.literal("unpublish"), v.literal("reactivate")) }, returns: v.object({ revision: v.number() }), handler: async (ctx, args) => ({ revision: await setLessonLifecycleForActor(ctx, await requireLearnActor(ctx, args.userId), args) }) });
export const forkLesson = internalMutation({ args: { ...actor, lessonId: v.id("lessons"), versionId: v.id("lessonVersions") }, returns: v.object({ lessonId: v.id("lessons"), revision: v.number() }), handler: async (ctx, args) => ({ lessonId: await forkLessonForActor(ctx, await requireLearnActor(ctx, args.userId), args), revision: 0 }) });
export const getLesson = internalQuery({ args: { ...actor, lessonId: v.id("lessons"), view: v.union(v.literal("draft"), v.literal("published"), v.literal("outline")), outlineFrom: v.optional(v.union(v.literal("draft"), v.literal("published"))), offset: v.optional(v.number()), limit: v.optional(v.number()) }, returns: lessonReadResult, handler: async (ctx, args) => readLessonForActor(ctx, await requireLearnActor(ctx, args.userId), args) });

export const listLessons = internalQuery({ args: { ...actor, scope: v.union(v.literal("owned"), v.literal("public")), query: v.optional(v.string()), limit: v.optional(v.number()), cursor: v.optional(v.string()) }, returns: v.object({ items: v.array(lessonSummary), nextCursor: v.union(v.string(), v.null()) }), handler: async (ctx, args) => {
  const userId = await requireLearnActor(ctx, args.userId), limit = args.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (args.query?.length ?? 0) > 200 || (args.cursor?.length ?? 0) > 2000) throw new Error("VALIDATION_FAILED: Invalid search or pagination.");
  const query = args.query?.trim();
  const rows = query && args.scope === "public" ? ctx.db.query("lessons").withSearchIndex("search_text", q => {
    const search = q.search("searchText", query);
    return search.eq("visibility", "public").eq("communityState", "ok").eq("status", "active");
  }) : args.scope === "owned" ? ctx.db.query("lessons").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", userId)).order("desc") : ctx.db.query("lessons").withIndex("by_visibility_and_communityState", q => q.eq("visibility", "public").eq("communityState", "ok")).order("desc");
  const page = await rows.paginate({ numItems: limit, cursor: args.cursor ?? null, maximumRowsRead: 100, maximumBytesRead: 2_000_000 });
  const items = [];
  for (const lesson of page.page) {
    if (args.scope === "owned") {
      if (!query || [lesson.metadata.title, lesson.metadata.description, ...lesson.metadata.tags].join(" ").toLowerCase().includes(query.toLowerCase())) items.push(summarizeLesson(lesson));
      continue;
    }
    if (lesson.status !== "active" || !lesson.publishedVersionId || await creatorRestricted(ctx, lesson.ownerId)) continue;
    const version = await ctx.db.get("lessonVersions", lesson.publishedVersionId);
    if (version?.lessonId === lesson._id) items.push(summarizeLesson(lesson, version.metadata));
  }
  return { items, nextCursor: page.isDone ? null : page.continueCursor };
} });

// Deliberate metadata allow-list: no blob, storage ID, signed URL or hash.
const sourceView = v.object({ sourceId: v.id("learnSources"), metadata: sourceMetadata, metadataVisibility: visibility, contentVisibility: visibility, createdAt: v.number() });
async function sourceMetadataForActor(ctx: QueryCtx, userId: string, sourceId: import("./_generated/dataModel").Id<"learnSources">) {
  const source = await ctx.db.get("learnSources", sourceId);
  if (!source || source.status === "removed" || await creatorRestricted(ctx, source.ownerId)) return null;
  const grant = source.metadataVisibility === "restricted" ? await ctx.db.query("learnSourceGrants").withIndex("by_sourceId_and_userId", q => q.eq("sourceId", source._id).eq("userId", userId)).unique() : null;
  if (source.ownerId !== userId && source.metadataVisibility !== "public" && !grant?.metadata) return null;
  return { sourceId: source._id, metadata: source.metadata, metadataVisibility: source.metadataVisibility, contentVisibility: source.contentVisibility, createdAt: source.createdAt };
}
export const getSourceMetadata = internalQuery({ args: { ...actor, sourceId: v.id("learnSources") }, returns: v.union(v.null(), sourceView), handler: async (ctx, args) => sourceMetadataForActor(ctx, await requireLearnActor(ctx, args.userId), args.sourceId) });
export const getLessonSources = internalQuery({ args: { ...actor, lessonId: v.id("lessons"), view: v.union(v.literal("draft"), v.literal("published")) }, returns: v.object({ sources: v.array(sourceView) }), handler: async (ctx, args) => {
  const userId = await requireLearnActor(ctx, args.userId);
  const lesson = await lessonAccessForActor(ctx, userId, args.lessonId, args.view === "draft");
  const version = args.view === "published" && lesson.publishedVersionId ? await ctx.db.get("lessonVersions", lesson.publishedVersionId) : null;
  if (args.view === "published" && (!version || version.lessonId !== lesson._id)) throw new Error("NOT_FOUND: No published lesson version.");
  const document = args.view === "draft" ? lesson.draft : version!.document;
  const ids = new Set<import("./_generated/dataModel").Id<"learnSources">>();
  for (const block of document.blocks) {
    for (const citation of block.citations) ids.add(citation.sourceId);
    if (block.type === "image" || block.type === "source") ids.add(block.sourceId);
  }
  if (ids.size > 50) throw new Error("VALIDATION_FAILED: At most 50 sources per lesson.");
  const sources = [];
  for (const id of ids) { const source = await sourceMetadataForActor(ctx, userId, id); if (source) sources.push(source); }
  return { sources };
} });
export const getLessonOutline = internalQuery({ args: { ...actor, lessonId: v.id("lessons"), outlineFrom: v.optional(v.union(v.literal("draft"), v.literal("published"))), offset: v.optional(v.number()), limit: v.optional(v.number()) }, returns: lessonReadResult, handler: async (ctx, args) => readLessonForActor(ctx, await requireLearnActor(ctx, args.userId), { ...args, view: "outline" }) });
export const addBlocks = internalMutation({ args: { ...edit, blocks: v.array(lessonBlock) }, returns: v.object({ revision: v.number() }), handler: async (ctx, args) => ({ revision: await editLessonBlocksForActor(ctx, await requireLearnActor(ctx, args.userId), { ...args, operations: [{ action: "append", blocks: args.blocks }] }) }) });
export const updateBlocks = internalMutation({ args: { ...edit, blocks: v.array(lessonBlock) }, returns: v.object({ revision: v.number() }), handler: async (ctx, args) => ({ revision: await editLessonBlocksForActor(ctx, await requireLearnActor(ctx, args.userId), { ...args, operations: args.blocks.map(block => ({ action: "update" as const, blockId: block.id, block })) }) }) });
export const moveBlocks = internalMutation({ args: { ...edit, moves: v.array(v.object({ blockId: v.string(), beforeId: v.union(v.string(), v.null()) })) }, returns: v.object({ revision: v.number() }), handler: async (ctx, args) => ({ revision: await editLessonBlocksForActor(ctx, await requireLearnActor(ctx, args.userId), { ...args, operations: args.moves.map(move => ({ ...move, action: "move" as const })) }) }) });
export const deleteBlocks = internalMutation({ args: { ...edit, blockIds: v.array(v.string()) }, returns: v.object({ revision: v.number() }), handler: async (ctx, args) => ({ revision: await editLessonBlocksForActor(ctx, await requireLearnActor(ctx, args.userId), { ...args, operations: args.blockIds.map(blockId => ({ action: "delete" as const, blockId })) }) }) });

export const getCapabilities = internalQuery({ args: actor, returns: v.object({ schemaVersion: v.number(), limits: v.record(v.string(), v.number()), tools: v.record(v.string(), v.object({ tools: v.array(v.string()), notes: v.string() })) }), handler: async (ctx, args) => {
  await requireLearnActor(ctx, args.userId);
  return { schemaVersion: 1, limits: learnCapabilityLimits, tools: Object.fromEntries(Object.entries(mcpToolGroups).map(([area, group]) => [area, { tools: [...group.tools], notes: group.notes }])) };
} });
const versionSummary = v.object({ versionId: v.id("lessonVersions"), number: v.number(), metadata: lessonMeta, publishedAt: v.number(), current: v.boolean() });
export const listLessonVersions = internalQuery({ args: { ...actor, lessonId: v.id("lessons"), beforeNumber: v.optional(v.number()), limit: v.optional(v.number()) }, returns: v.object({ versions: v.array(versionSummary), nextBeforeNumber: v.union(v.number(), v.null()) }), handler: async (ctx, args) => {
  const userId = await requireLearnActor(ctx, args.userId);
  const lesson = await lessonAccessForActor(ctx, userId, args.lessonId, true);
  const limit = args.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (args.beforeNumber !== undefined && (!Number.isSafeInteger(args.beforeNumber) || args.beforeNumber < 1))) throw new Error("VALIDATION_FAILED: Invalid version pagination.");
  const rows = await ctx.db.query("lessonVersions").withIndex("by_lessonId_and_number", q => args.beforeNumber === undefined ? q.eq("lessonId", lesson._id) : q.eq("lessonId", lesson._id).lt("number", args.beforeNumber)).order("desc").take(limit + 1);
  const page = rows.slice(0, limit);
  return { versions: page.map(version => ({ versionId: version._id, number: version.number, metadata: version.metadata, publishedAt: version.publishedAt, current: lesson.publishedVersionId === version._id })), nextBeforeNumber: rows.length > limit ? page[page.length - 1].number : null };
} });
export const getLessonVersion = internalQuery({ args: { ...actor, lessonId: v.id("lessons"), versionId: v.id("lessonVersions"), offset: v.optional(v.number()), limit: v.optional(v.number()) }, returns: v.object({ versionId: v.id("lessonVersions"), metadata: lessonMeta, document: lessonDocument, totalBlocks: v.number(), nextOffset: v.union(v.number(), v.null()) }), handler: async (ctx, args) => {
  const userId = await requireLearnActor(ctx, args.userId);
  const lesson = await lessonAccessForActor(ctx, userId, args.lessonId);
  const version = await ctx.db.get("lessonVersions", args.versionId);
  if (!version || version.lessonId !== lesson._id || (userId !== lesson.ownerId && version._id !== lesson.publishedVersionId && (lesson.visibility !== "public" || version.visibility !== "public"))) throw new Error("NOT_FOUND: Version not accessible.");
  const offset = args.offset ?? 0, limit = args.limit ?? 50;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > LEARN_LIMITS.blocks || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("VALIDATION_FAILED: Invalid block pagination.");
  const blocks = version.document.blocks.slice(offset, offset + limit);
  return { versionId: version._id, metadata: version.metadata, document: { schemaVersion: 1 as const, blocks }, totalBlocks: version.document.blocks.length, nextOffset: offset + blocks.length < version.document.blocks.length ? offset + blocks.length : null };
} });
