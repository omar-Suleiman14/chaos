import { enqueueLearnWebhookEvent } from "./learnWebhookEvents";
import { requireVisibilityAllowed } from "./plans";
import { recordPublicationAction } from "./learnPublicationAudit";
import { v, ConvexError } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import schema from "./schema";
import { requireActiveUser, creatorRestricted } from "./authz";
import { lessonBlock, lessonDocument, lessonMeta, visibility, LEARN_LIMITS, LEARN_WRITE_LIMITS, type LessonDocument } from "./learnModel";
import { consumeRate } from "./serverUtils";
import { assertDocument, validateDocument, validateMetadataPresentation, type LessonProblem } from "./learnValidation";

export async function lessonAccess(ctx: QueryCtx | MutationCtx, id: Id<"lessons">, edit = false) {
  const identity = await ctx.auth.getUserIdentity();
  return lessonAccessForActor(ctx, identity?.subject ?? null, id, edit);
}

export async function lessonAccessForActor(ctx: QueryCtx | MutationCtx, actor: string | null, id: Id<"lessons">, edit = false) {
  const lesson = await ctx.db.get("lessons", id);
  if (!lesson) throw new Error("NOT_FOUND: Lesson not found or unavailable.");
  if (actor === lesson.ownerId) return lesson;
  const grant = actor ? await ctx.db.query("lessonPermissions").withIndex("by_lessonId_and_userId", q => q.eq("lessonId", id).eq("userId", actor!)).unique() : null;
  if (grant && (!edit || grant.role === "editor")) {
    // Explicit policy: Direct grants do NOT bypass platform moderation or creator restriction.
    if (lesson.communityState === "removed" || await creatorRestricted(ctx, lesson.ownerId)) {
      throw new Error("NOT_FOUND: Lesson not found or unavailable.");
    }
    return lesson;
  }
  if (!edit && lesson.status === "active" && lesson.visibility === "public" && lesson.communityState === "ok" && lesson.publishedVersionId && !await creatorRestricted(ctx, lesson.ownerId)) return lesson;
  throw new Error("NOT_FOUND: Lesson not found or unavailable.");
}
function revisionCheck(lesson: Doc<"lessons">, expected: number) {
  if (!Number.isSafeInteger(expected) || expected !== lesson.revision) throw new ConvexError({ code: "REVISION_CONFLICT", expectedRevision: expected, currentRevision: lesson.revision, draft: lesson.draft, metadata: lesson.metadata });
}
export function metadataCheck(metadata: Doc<"lessons">["metadata"]) {
  const presentationProblems = validateMetadataPresentation(metadata);
  if (presentationProblems.length) throw new ConvexError({ code: "VALIDATION", problems: presentationProblems.map(problem => ({ ...problem })) });
  if (!metadata.title.trim() || metadata.title.length > LEARN_LIMITS.title || metadata.description.length > 4000 || metadata.language.length > 35 || metadata.tags.length > LEARN_LIMITS.tags || metadata.tags.some(t => !t.trim() || t.length > 80) || (metadata.license?.length ?? 0) > 300) throw new Error("Invalid lesson metadata: title, description, language, tags or license exceeds limits");
}
async function recovery(ctx: MutationCtx, lesson: Doc<"lessons">) {
  await ctx.db.insert("lessonDraftRecovery", { lessonId: lesson._id, revision: lesson.revision, metadata: lesson.metadata, document: lesson.draft, savedAt: Date.now() });
  const old = await ctx.db.query("lessonDraftRecovery").withIndex("by_lessonId_and_revision", q => q.eq("lessonId", lesson._id)).order("desc").take(11);
  for (const row of old.slice(10)) await ctx.db.delete("lessonDraftRecovery", row._id);
}
export const create = mutation({ args: { metadata: lessonMeta, document: v.optional(lessonDocument) }, returns: v.id("lessons"), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx);
  return createLessonForActor(ctx, identity.subject, args);
} });
export async function buildLessonSearchText(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  metadata: Doc<"lessons">["metadata"],
  blocks: Doc<"lessons">["draft"]["blocks"]
): Promise<string> {
  const owner = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q: any) => q.eq("clerkId", ownerId))
    .first();
  const blockTexts = blocks.flatMap((b) => [
    "text" in b && b.text ? b.text : "",
    "caption" in b && b.caption ? b.caption : "",
    "title" in b && b.title ? b.title : "",
  ]);
  const parts = [
    metadata.title || "",
    metadata.description || "",
    metadata.authorDisplay || "",
    owner?.name || "",
    owner?.username || "",
    ...(metadata.tags || []),
    ...blockTexts,
  ].filter(Boolean);
  return parts.join("\n");
}

export async function createLessonForActor(ctx: MutationCtx, actor: string, args: { metadata: Doc<"lessons">["metadata"]; document?: Doc<"lessons">["draft"] }) {
  metadataCheck(args.metadata);
  const draft = args.document ?? { schemaVersion: 1 as const, blocks: [] };
  assertDocument(draft);
  await consumeRate(ctx, `learn:create:${actor}`, LEARN_WRITE_LIMITS.creationsPerHour, 3_600_000);
  const now = Date.now();
  const searchText = await buildLessonSearchText(ctx, actor, args.metadata, draft.blocks);
  const lessonId = await ctx.db.insert("lessons", { ownerId: actor, metadata: args.metadata, draft, revision: 0, status: "active", visibility: "private", communityState: "ok", createdAt: now, updatedAt: now, searchText });
  await recordPublicationAction(ctx, { lessonId, actorId: actor, action: "create", revision: 0, afterVisibility: "private", reason: "Created an editable private draft." });
  return lessonId;
}

export const saveDraft = mutation({ args: { lessonId: v.id("lessons"), expectedRevision: v.number(), document: lessonDocument, metadata: v.optional(lessonMeta) }, returns: v.number(), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx);
  return saveLessonDraftForActor(ctx, identity.subject, args);
} });
export async function saveLessonDraftForActor(ctx: MutationCtx, actor: string, args: { lessonId: Id<"lessons">; expectedRevision: number; document: Doc<"lessons">["draft"]; metadata?: Doc<"lessons">["metadata"] }) {
  const lesson = await lessonAccessForActor(ctx, actor, args.lessonId, true);
  revisionCheck(lesson, args.expectedRevision); assertDocument(args.document);
  if (args.metadata) metadataCheck(args.metadata);
  await consumeRate(ctx, `learn:write:${actor}`, LEARN_WRITE_LIMITS.draftWritesPerMinute, 60_000);
  await recovery(ctx, lesson);
  const searchText = await buildLessonSearchText(ctx, actor, args.metadata ?? lesson.metadata, args.document.blocks);
  await ctx.db.patch("lessons", lesson._id, { draft: args.document, metadata: args.metadata ?? lesson.metadata, searchText, revision: lesson.revision + 1, updatedAt: Date.now() });
  await enqueueLearnWebhookEvent(ctx, { event: "lesson.updated", lessonId: lesson._id, operationId: `revision:${lesson.revision + 1}`, revision: lesson.revision + 1 });
  return lesson.revision + 1;
}

export async function publicationProblems(ctx: MutationCtx, lesson: Doc<"lessons">): Promise<LessonProblem[]> {
  const errors = validateDocument(lesson.draft);
  try { metadataCheck(lesson.metadata); } catch { errors.push({ path: "metadata", code: "METADATA", message: "Fix invalid lesson metadata before publishing." }); }
  if (!lesson.draft.blocks.length) errors.push({ path: "blocks", code: "EMPTY", message: "Add material before publishing." });
  const sources = new Set<Id<"learnSources">>();
  const concepts = new Map<string, boolean>();
  for (const block of lesson.draft.blocks) {
    for (const rawId of block.conceptIds) {
      if (!concepts.has(rawId)) {
        const id = ctx.db.normalizeId("learnConcepts", rawId);
        concepts.set(rawId, !!id && !!await ctx.db.get("learnConcepts", id));
      }
      if (!concepts.get(rawId)) errors.push({ path: `blocks.${block.id}.conceptIds`, code: "UNKNOWN_CONCEPT", message: `Unknown concept ID ${rawId}. Use a stable Learn concept ID.` });
    }
    block.citations.forEach(c => sources.add(c.sourceId));
    if (block.type === "source" || block.type === "image") sources.add(block.sourceId);
    if (block.type === "quiz") {
      const asset = block.asset.kind === "form" ? await ctx.db.get("forms", block.asset.id) : await ctx.db.get("quizzes", block.asset.id);
      // Public embeds require an actual published assessment; never snapshot quiz data.
      let eligible = false;
      if (asset && !asset.isBanned) {
        if ("ownerId" in asset && asset.ownerId === lesson.ownerId && asset.status === "live" && asset.publishedVersion !== undefined) {
          const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", q => q.eq("formId", asset._id).eq("version", asset.publishedVersion!)).unique();
          eligible = !!version?.definition.quiz?.enabled;
        } else if ("creatorId" in asset) eligible = asset.creatorId === lesson.ownerId && asset.isPublished && !!asset.publishedSnapshot;
      }
      if (!eligible) errors.push({ path: `blocks.${block.id}.asset`, code: "QUIZ", message: "Attach an owned, published assessment." });
    }
  }
  if (sources.size > LEARN_LIMITS.sources) errors.push({ path: "sources", code: "LIMIT", message: `At most ${LEARN_LIMITS.sources} sources per lesson.` });
  for (const sourceId of sources) {
    const source = await ctx.db.get("learnSources", sourceId);
    if (!source || await creatorRestricted(ctx, source.ownerId) || source.status !== "active" || source.metadataVisibility !== "public" || (source.ownerId !== lesson.ownerId && source.contentVisibility !== "public")) errors.push({ path: `sources.${sourceId}`, code: "SOURCE_ACCESS", message: "Source must exist, remain active and have public metadata; private content remains independently protected." });
    if (source?.storageId && !(await ctx.db.system.get("_storage", source.storageId))) errors.push({ path: `sources.${sourceId}`, code: "MISSING_FILE", message: "Referenced source file no longer exists." });
    if (lesson.draft.blocks.some(b => b.type === "image" && b.sourceId === sourceId) && (source?.metadata.kind !== "image" || source.contentVisibility !== "public" || !source.storageId)) errors.push({ path: `sources.${sourceId}`, code: "IMAGE_ACCESS", message: "Embedded images require a publicly accessible image source." });
  }
  const mappings = await ctx.db.query("lessonCurriculumMappings").withIndex("by_lessonId_and_nodeId", q => q.eq("lessonId", lesson._id)).take(101);
  if (mappings.length > 100) errors.push({ path: "curriculumMappings", code: "LIMIT", message: "At most 100 curriculum mappings per lesson." });
  const blocks = new Map(lesson.draft.blocks.map(b => [b.id, b]));
  const resolvedSlugs = new Map<string, Id<"learnConcepts"> | null>();
  for (const mapping of mappings.slice(0, 100)) {
    const node = await ctx.db.get("curriculumNodes", mapping.nodeId);
    const version = await ctx.db.get("curriculumVersions", mapping.versionId);
    let valid = !!node && !!version && node.versionId === mapping.versionId && (mapping.blockIds.length > 0 || mapping.conceptKeys.length > 0) && mapping.blockIds.length <= 100 && new Set(mapping.blockIds).size === mapping.blockIds.length && mapping.blockIds.every(id => blocks.has(id)) && mapping.conceptKeys.length <= 100 && new Set(mapping.conceptKeys).size === mapping.conceptKeys.length;
    const coveredBlocks = mapping.blockIds.length ? mapping.blockIds.map(id => blocks.get(id)).filter(b => b !== undefined) : lesson.draft.blocks;
    for (const slug of mapping.conceptKeys.slice(0, 100)) {
      if (!resolvedSlugs.has(slug)) {
        const concept = await ctx.db.query("learnConcepts").withIndex("by_slug", q => q.eq("slug", slug)).unique();
        resolvedSlugs.set(slug, concept?._id ?? null);
      }
      const conceptId = resolvedSlugs.get(slug);
      if (!node?.conceptKeys.includes(slug) || !conceptId || !coveredBlocks.some(b => b.conceptIds.includes(conceptId))) valid = false;
    }
    if (!valid) errors.push({ path: "curriculumMappings." + mapping._id, code: "CURRICULUM", message: "Mapping requires a valid node/version, current blocks and stable concept IDs taught by the covered blocks (or anywhere in the lesson for concept-only coverage)." });
  }
  return errors;
}
const problemValidator = v.object({ path: v.string(), code: v.string(), message: v.string() });
export const publish = mutation({ args: { lessonId: v.id("lessons"), expectedRevision: v.number(), visibility, note: v.optional(v.string()) }, returns: v.union(v.object({ ok: v.literal(false), problems: v.array(problemValidator) }), v.object({ ok: v.literal(true), versionId: v.id("lessonVersions"), revision: v.number() })), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx);
  return publishLessonForActor(ctx, identity.subject, args);
} });
export async function publishLessonForActor(ctx: MutationCtx, actor: string, args: { lessonId: Id<"lessons">; expectedRevision: number; visibility: Doc<"lessons">["visibility"]; note?: string }) {
  const lesson = await lessonAccessForActor(ctx, actor, args.lessonId, true);
  if (actor !== lesson.ownerId) throw new Error("Only the owner can publish");
  revisionCheck(lesson, args.expectedRevision);
  if (lesson.communityState !== "ok" || lesson.status !== "active") throw new Error("Resolve moderation or archive state before publishing");
  if (args.note !== undefined && args.note.length > 2000) throw new Error("Version note must contain at most 2000 characters");
  await requireVisibilityAllowed(ctx, lesson.ownerId, args.visibility);
  const problems = await publicationProblems(ctx, lesson);
  if (problems.length) return { ok: false as const, problems };
  await consumeRate(ctx, `learn:publish:${actor}`, LEARN_WRITE_LIMITS.publicationsPerHour, 3_600_000);
  const last = await ctx.db.query("lessonVersions").withIndex("by_lessonId_and_number", q => q.eq("lessonId", lesson._id)).order("desc").first();
  const curriculumMappings = (await ctx.db.query("lessonCurriculumMappings").withIndex("by_lessonId_and_nodeId", q => q.eq("lessonId", lesson._id)).take(100)).map(({ versionId, nodeId, conceptKeys, blockIds }) => ({ versionId, nodeId, conceptKeys, blockIds }));
  const versionId = await ctx.db.insert("lessonVersions", { ...(args.note?.trim() ? { note: args.note.trim() } : {}), visibility: args.visibility, curriculumMappings, lessonId: lesson._id, number: (last?.number ?? 0) + 1, metadata: lesson.metadata, document: lesson.draft, authorId: actor, publishedAt: Date.now() });
  const searchText = await buildLessonSearchText(ctx, actor, lesson.metadata, lesson.draft.blocks);
  await ctx.db.patch("lessons", lesson._id, { publishedVersionId: versionId, visibility: args.visibility, searchText, revision: lesson.revision + 1, updatedAt: Date.now() });
  await enqueueLearnWebhookEvent(ctx, { event: "lesson.published", lessonId: lesson._id, versionId, operationId: `version:${versionId}`, revision: lesson.revision + 1 });
  await recordPublicationAction(ctx, { lessonId: lesson._id, actorId: actor, action: "publish", revision: lesson.revision + 1, versionId, beforeVisibility: lesson.visibility, afterVisibility: args.visibility, reason: args.note?.trim() || "Explicitly published an immutable lesson version." });
  return { ok: true as const, versionId, revision: lesson.revision + 1 };
}

export const getDraft = query({ args: { lessonId: v.id("lessons") }, returns: schema.doc("lessons"), handler: async (ctx, args) => { await requireActiveUser(ctx); return lessonAccess(ctx, args.lessonId, true); } });
export const getPublished = query({ args: { lessonId: v.id("lessons") }, returns: v.union(schema.doc("lessonVersions"), v.null()), handler: async (ctx, args) => {
  const lesson = await lessonAccess(ctx, args.lessonId);
  return lesson.publishedVersionId ? ctx.db.get("lessonVersions", lesson.publishedVersionId) : null;
} });
export const listOwned = query({ args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("lessons")), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx);
  return ctx.db.query("lessons").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", identity.subject)).order("desc").paginate(args.paginationOpts);
} });
export const listVersions = query({ args: { lessonId: v.id("lessons"), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("lessonVersions")), handler: async (ctx, args) => {
  await requireActiveUser(ctx); await lessonAccess(ctx, args.lessonId, true);
  return ctx.db.query("lessonVersions").withIndex("by_lessonId_and_number", q => q.eq("lessonId", args.lessonId)).order("desc").paginate(args.paginationOpts);
} });
export const restoreVersion = mutation({ args: { lessonId: v.id("lessons"), versionId: v.id("lessonVersions"), expectedRevision: v.number() }, returns: v.number(), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx);
  return restoreLessonVersionForActor(ctx, identity.subject, args);
} });
export async function restoreLessonVersionForActor(ctx: MutationCtx, actor: string, args: { lessonId: Id<"lessons">; versionId: Id<"lessonVersions">; expectedRevision: number }) {
  const lesson = await lessonAccessForActor(ctx, actor, args.lessonId, true); revisionCheck(lesson, args.expectedRevision);
  const version = await ctx.db.get("lessonVersions", args.versionId);
  if (!version || version.lessonId !== lesson._id) throw new Error("Version does not belong to this lesson");
  await recovery(ctx, lesson);
  const searchText = await buildLessonSearchText(ctx, actor, version.metadata, version.document.blocks);
  await ctx.db.patch("lessons", lesson._id, { draft: version.document, metadata: version.metadata, searchText, revision: lesson.revision + 1, updatedAt: Date.now() });
  await recordPublicationAction(ctx, { lessonId: lesson._id, actorId: actor, action: "restore_draft", revision: lesson.revision + 1, versionId: version._id, beforeVisibility: lesson.visibility, afterVisibility: lesson.visibility, reason: "Restored a historical version into the draft; publication is unchanged." });
  return lesson.revision + 1;
}

export const listRecovery = query({ args: { lessonId: v.id("lessons") }, returns: v.array(schema.doc("lessonDraftRecovery")), handler: async (ctx, args) => {
  await requireActiveUser(ctx); await lessonAccess(ctx, args.lessonId, true);
  return ctx.db.query("lessonDraftRecovery").withIndex("by_lessonId_and_revision", q => q.eq("lessonId", args.lessonId)).order("desc").take(10);
} });
export const setLifecycle = mutation({ args: { lessonId: v.id("lessons"), expectedRevision: v.number(), action: v.union(v.literal("archive"), v.literal("unpublish"), v.literal("reactivate")) }, returns: v.number(), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx);
  return setLessonLifecycleForActor(ctx, identity.subject, args);
} });
export async function setLessonLifecycleForActor(ctx: MutationCtx, actor: string, args: { lessonId: Id<"lessons">; expectedRevision: number; action: "archive" | "unpublish" | "reactivate" }) {
  const lesson = await lessonAccessForActor(ctx, actor, args.lessonId, true);
  if (lesson.ownerId !== actor) throw new Error("Only owner can change lifecycle"); revisionCheck(lesson, args.expectedRevision);
  await ctx.db.patch("lessons", lesson._id, { status: args.action === "archive" ? "archived" : "active", ...(args.action === "unpublish" ? { publishedVersionId: undefined, visibility: "private" as const } : {}), revision: lesson.revision + 1, updatedAt: Date.now() });
  await recordPublicationAction(ctx, { lessonId: lesson._id, actorId: actor, action: args.action, revision: lesson.revision + 1, ...(lesson.publishedVersionId ? { versionId: lesson.publishedVersionId } : {}), beforeVisibility: lesson.visibility, afterVisibility: args.action === "unpublish" ? "private" : lesson.visibility, reason: `Owner requested ${args.action}. Version history remains intact.` });
  return lesson.revision + 1;
}

export const fork = mutation({ args: { lessonId: v.id("lessons"), versionId: v.id("lessonVersions") }, returns: v.id("lessons"), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx);
  return forkLessonForActor(ctx, identity.subject, args);
} });
export async function forkLessonForActor(ctx: MutationCtx, actor: string, args: { lessonId: Id<"lessons">; versionId: Id<"lessonVersions"> }) {
  const parent = await lessonAccessForActor(ctx, actor, args.lessonId);
  const version = await ctx.db.get("lessonVersions", args.versionId);
  if (!version || version.lessonId !== parent._id || (actor !== parent.ownerId && version._id !== parent.publishedVersionId)) throw new Error("Version not accessible");
  // Content is copied by value; source IDs remain citations with independent access.
  await consumeRate(ctx, `learn:create:${actor}`, LEARN_WRITE_LIMITS.creationsPerHour, 3_600_000);
  const lessonId = await ctx.db.insert("lessons", { ownerId: actor, metadata: version.metadata, draft: version.document, revision: 0, status: "active", visibility: "private", communityState: "ok", parentLessonId: parent._id, parentVersionId: version._id, originLessonId: parent.originLessonId ?? parent._id, createdAt: Date.now(), updatedAt: Date.now(), searchText: "" });
  await enqueueLearnWebhookEvent(ctx, { event: "lesson.forked", lessonId, operationId: "fork:0", revision: 0 });
  await recordPublicationAction(ctx, { lessonId, actorId: actor, action: "fork", revision: 0, versionId: version._id, parentLessonId: parent._id, afterVisibility: "private", reason: "Created a private copy from an immutable parent version, retaining lineage." });
  return lessonId;
}



/** Shared, validated block commands. Update replaces one block but keeps its ID. */
export const lessonBlockOperation = v.union(
  v.object({ action: v.literal("append"), blocks: v.array(lessonBlock) }),
  v.object({ action: v.literal("update"), blockId: v.string(), block: lessonBlock }),
  v.object({ action: v.literal("move"), blockId: v.string(), beforeId: v.union(v.string(), v.null()) }),
  v.object({ action: v.literal("delete"), blockId: v.string() })
);
export type LessonBlockOperation = import("convex/values").Infer<typeof lessonBlockOperation>;
/** Pure: the draft blocks after a batch of operations; throws on invalid operations. */
export function applyBlockOperations(current: LessonDocument["blocks"], operations: LessonBlockOperation[]): LessonDocument["blocks"] {
  const blocks = [...current];
  for (const op of operations) {
    if (op.action === "append") { if (!op.blocks.length) throw new Error("VALIDATION_FAILED: Append needs blocks."); blocks.push(...op.blocks); continue; }
    const index = blocks.findIndex(b => b.id === op.blockId);
    if (index < 0) throw new Error("NOT_FOUND: Block not found.");
    if (op.action === "update") {
      if (op.block.id !== op.blockId) throw new Error("VALIDATION_FAILED: Preserve the stable block ID.");
      blocks[index] = op.block;
    } else if (op.action === "delete") {
      // Refuse orphaning children; explicitly remove/reparent them in the same batch first.
      if (blocks.some(b => b.parentId === op.blockId)) throw new Error("VALIDATION_FAILED: Remove or reparent child blocks first.");
      blocks.splice(index, 1);
    } else {
      if (op.beforeId === op.blockId) throw new Error("VALIDATION_FAILED: A block cannot move before itself.");
      const [block] = blocks.splice(index, 1);
      const target = op.beforeId === null ? blocks.length : blocks.findIndex(b => b.id === op.beforeId);
      if (target < 0) throw new Error("NOT_FOUND: Destination block not found.");
      blocks.splice(target, 0, block);
    }
  }
  return blocks;
}
export async function editLessonBlocksForActor(ctx: MutationCtx, actor: string, args: {
  lessonId: Id<"lessons">; expectedRevision: number; operations: LessonBlockOperation[];
}) {
  const lesson = await lessonAccessForActor(ctx, actor, args.lessonId, true);
  revisionCheck(lesson, args.expectedRevision);
  if (!args.operations.length || args.operations.length > 100) throw new Error("VALIDATION_FAILED: Send 1?100 block operations.");
  const blocks = applyBlockOperations(lesson.draft.blocks, args.operations);
  return saveLessonDraftForActor(ctx, actor, { lessonId: args.lessonId, expectedRevision: args.expectedRevision, document: { schemaVersion: 1, blocks } });
}
export const lessonSummary = v.object({ lessonId: v.id("lessons"), metadata: lessonMeta, revision: v.number(), status: v.union(v.literal("active"), v.literal("archived")), visibility, communityState: v.union(v.literal("ok"), v.literal("review"), v.literal("hidden"), v.literal("removed")), publishedVersionId: v.union(v.id("lessonVersions"), v.null()), updatedAt: v.number() });
export function summarizeLesson(lesson: Doc<"lessons">, metadata = lesson.metadata) {
  return { lessonId: lesson._id, metadata, revision: lesson.revision, status: lesson.status, visibility: lesson.visibility, communityState: lesson.communityState, publishedVersionId: lesson.publishedVersionId ?? null, updatedAt: lesson.updatedAt };
}
export const lessonReadResult = lessonSummary.extend({ view: v.union(v.literal("draft"), v.literal("published"), v.literal("outline")), versionId: v.union(v.id("lessonVersions"), v.null()), document: v.union(lessonDocument, v.null()), outline: v.array(v.object({ id: v.string(), parentId: v.optional(v.string()), type: v.string(), title: v.string() })), totalBlocks: v.number(), nextOffset: v.union(v.number(), v.null()) });
/** Outline defaults to the published snapshot; draft access always requires edit permission. */
export async function readLessonForActor(ctx: QueryCtx | MutationCtx, actor: string | null, args: {
  lessonId: Id<"lessons">; view: "draft" | "published" | "outline"; outlineFrom?: "draft" | "published"; offset?: number; limit?: number;
}) {
  const draft = args.view === "draft" || (args.view === "outline" && args.outlineFrom === "draft");
  const lesson = await lessonAccessForActor(ctx, actor, args.lessonId, draft);
  const offset = args.offset ?? 0, limit = args.limit ?? 50;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > LEARN_LIMITS.blocks || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("VALIDATION_FAILED: offset must be 0?500 and limit 1?100.");
  const version = !draft && lesson.publishedVersionId ? await ctx.db.get("lessonVersions", lesson.publishedVersionId) : null;
  if (!draft && (!version || version.lessonId !== lesson._id)) throw new Error("NOT_FOUND: No published lesson version.");
  const document = draft ? lesson.draft : version!.document;
  const blocks = document.blocks.slice(offset, offset + limit);
  return { ...summarizeLesson(lesson, draft ? lesson.metadata : version!.metadata), view: args.view, versionId: draft ? null : version!._id,
    document: args.view === "outline" ? null : { schemaVersion: 1 as const, blocks },
    outline: args.view === "outline" ? blocks.map(b => ({ id: b.id, ...(b.parentId ? { parentId: b.parentId } : {}), type: b.type, title: "text" in b ? b.text.slice(0, 200) : "caption" in b ? b.caption.slice(0, 200) : "label" in b ? b.label.slice(0, 200) : "" })) : [],
    totalBlocks: document.blocks.length, nextOffset: offset + blocks.length < document.blocks.length ? offset + blocks.length : null };
}

export const reindexAllLessons = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const lessons = await ctx.db.query("lessons").take(500);
    let count = 0;
    for (const l of lessons) {
      const version = l.publishedVersionId ? await ctx.db.get("lessonVersions", l.publishedVersionId) : null;
      const meta = version ? version.metadata : l.metadata;
      const blocks = version ? version.document.blocks : l.draft.blocks;
      const searchText = await buildLessonSearchText(ctx, l.ownerId, meta, blocks);
      if (l.searchText !== searchText) {
        await ctx.db.patch("lessons", l._id, { searchText });
        count++;
      }
    }
    return count;
  },
});
