import { v, type Infer } from "convex/values";
import { query, type QueryCtx, type MutationCtx } from "./_generated/server";
import { requireActiveUser, creatorRestricted } from "./authz";
import { lessonAccessForActor } from "./lessons";
import { lessonBlock, lessonMeta, sourceMetadata } from "./learnModel";
import { storedSourceExcerpt, CONTEXT_LIMITS } from "./learnContextModel";
import { nodeKind } from "./curriculumModel";
import { canReadSourcePart } from "./sourceAccess";
const curriculumContext = v.object({ versionId: v.id("curriculumVersions"), nodeId: v.id("curriculumNodes"), institution: v.string(), program: v.string(), version: v.string(), node: v.string(), kind: nodeKind, blockIds: v.array(v.string()), conceptKeys: v.array(v.string()) });
/** Controlled export only. This module neither calls a model nor sends data to a provider. */
export const contextSelection = v.object({ lessonId: v.id("lessons"), versionId: v.id("lessonVersions"), blockIds: v.array(v.string()), sourceIds: v.array(v.id("learnSources")), includeMyProgress: v.boolean(), includeCurriculum: v.optional(v.boolean()), excerptSelections: v.optional(v.array(v.object({ sourceId: v.id("learnSources"), excerptIds: v.array(v.string()) }))) });
export const contextResult = v.object({ schemaVersion: v.literal(1), lessonId: v.id("lessons"), versionId: v.id("lessonVersions"), metadata: lessonMeta, blocks: v.array(lessonBlock), sources: v.array(v.object({ id: v.id("learnSources"), metadata: sourceMetadata, includesContent: v.literal(false) })), curriculum: v.array(curriculumContext), sourceExcerpts: v.array(v.object({ sourceId: v.id("learnSources"), excerpt: storedSourceExcerpt, revision: v.number(), provenance: v.literal("owner-supplied-unverified") })), progress: v.union(v.null(), v.object({ completedBlockIds: v.array(v.string()) })), boundaries: v.object({ sourceExcerptsIncluded: v.boolean(), privateNotesIncluded: v.literal(false), outsideKnowledgeIncluded: v.literal(false) }) });
export async function assembleForActor(ctx: QueryCtx | MutationCtx, actor: { subject: string; tokenIdentifier: string }, args: Infer<typeof contextSelection>) {
    const identity = actor; const lesson = await lessonAccessForActor(ctx, actor.subject, args.lessonId); const version = await ctx.db.get("lessonVersions", args.versionId);
    if (!version || version.lessonId !== lesson._id || (lesson.ownerId !== identity.subject && (lesson.publishedVersionId !== version._id || lesson.status !== "active" || lesson.communityState !== "ok" || await creatorRestricted(ctx, lesson.ownerId)))) throw new Error("Lesson version not accessible");
    if (!args.blockIds.length || args.blockIds.length > 30 || new Set(args.blockIds).size !== args.blockIds.length || args.sourceIds.length > 20 || new Set(args.sourceIds).size !== args.sourceIds.length) throw new Error("Select 1-30 distinct blocks and at most 20 distinct cited sources");
    const selected = new Set(args.blockIds); const blocks = version.document.blocks.filter(b => selected.has(b.id));
    if (blocks.length !== selected.size || new TextEncoder().encode(JSON.stringify(blocks)).length > 50_000) throw new Error("Selection is missing or exceeds 50000 bytes");
    const cited = new Set(blocks.flatMap(b => [...b.citations.map(c => c.sourceId), ...((b.type === "source" || b.type === "image") ? [b.sourceId] : [])]));
    const sources = [];
    for (const id of args.sourceIds) {
      if (!cited.has(id)) throw new Error("Context sources must be cited by selected blocks");
      const source = await ctx.db.get("learnSources", id);
      if (!source || source.status === "removed" || await creatorRestricted(ctx, source.ownerId)) throw new Error("Source metadata unavailable");
      const grant = await ctx.db.query("learnSourceGrants").withIndex("by_sourceId_and_userId", q => q.eq("sourceId", id).eq("userId", identity.subject)).unique();
      if (source.ownerId !== identity.subject && source.metadataVisibility !== "public" && !(source.metadataVisibility === "restricted" && grant?.metadata)) throw new Error("Source metadata unavailable");
      sources.push({ id, metadata: source.metadata, includesContent: false as const });
    }
    const sourceExcerpts = [];
    const excerptSelections = args.excerptSelections ?? [];
    if (excerptSelections.length > CONTEXT_LIMITS.excerpts || new Set(excerptSelections.map(s => s.sourceId)).size !== excerptSelections.length || excerptSelections.reduce((n, s) => n + s.excerptIds.length, 0) > CONTEXT_LIMITS.excerpts) throw new Error("Select at most 10 distinct excerpts");
    for (const selection of excerptSelections) {
      if (!args.sourceIds.includes(selection.sourceId) || !selection.excerptIds.length || new Set(selection.excerptIds).size !== selection.excerptIds.length) throw new Error("Excerpts require explicit selected source metadata and distinct IDs");
      const source = await ctx.db.get("learnSources", selection.sourceId);
      if (!source || source.status === "removed" || await creatorRestricted(ctx, source.ownerId)) throw new Error("Source content unavailable");
      if (!await canReadSourcePart(ctx, source, identity.subject, "content")) throw new Error("Source content unavailable");
      for (const id of selection.excerptIds) {
        const excerpt = source.excerpts?.find(e => e.id === id);
        if (!excerpt || new TextEncoder().encode(excerpt.text).length > CONTEXT_LIMITS.excerptBytes) throw new Error("Stored excerpt unavailable or exceeds limit");
        // Exact locator matching prevents attaching a quotation from an unrelated page/section.
        if (!blocks.some(b => b.citations.some(c => c.sourceId === source._id && JSON.stringify(c.locator) === JSON.stringify(excerpt.locator)))) throw new Error("Excerpt location must be cited by selected blocks");
        sourceExcerpts.push({ sourceId: source._id, excerpt, revision: source.excerptRevision ?? 0, provenance: "owner-supplied-unverified" as const });
      }
    }
    const curriculum = [];
    if (args.includeCurriculum) {
      const mappings = (version.curriculumMappings ?? []).filter(m => !m.blockIds.length || m.blockIds.some(id => selected.has(id)));
      if (mappings.length > CONTEXT_LIMITS.curriculumMappings) throw new Error("Selected material has more than 10 curriculum mappings; narrow block selection");
      const keys = [...new Set(mappings.flatMap(m => m.conceptKeys))];
      if (keys.length > 100) throw new Error("Selected curriculum context exceeds 100 concepts");
      const taught = new Set(blocks.flatMap(b => b.conceptIds));
      const coveredKeys = new Set<string>();
      for (const key of keys) {
        const concept = await ctx.db.query("learnConcepts").withIndex("by_slug", q => q.eq("slug", key)).unique();
        if (concept && taught.has(concept._id)) coveredKeys.add(key);
      }
      for (const m of mappings) {
        const node = await ctx.db.get("curriculumNodes", m.nodeId);
        const cv = await ctx.db.get("curriculumVersions", m.versionId);
        if (!node || !cv || node.versionId !== cv._id) throw new Error("Published curriculum mapping unavailable");
        const program = await ctx.db.get("curriculumPrograms", cv.programId);
        const institution = program ? await ctx.db.get("curriculumInstitutions", program.institutionId) : null;
        if (!program || !institution) throw new Error("Published curriculum hierarchy unavailable");
        curriculum.push({ versionId: cv._id, nodeId: node._id, institution: institution.name, program: program.name, version: cv.name, node: node.name, kind: node.kind, blockIds: m.blockIds.filter(id => selected.has(id)), conceptKeys: m.conceptKeys.filter(key => coveredKeys.has(key)) });
      }
    }
    const state = args.includeMyProgress ? await ctx.db.query("learnProgress").withIndex("by_userKey_and_lessonId_and_key", q => q.eq("userKey", identity.tokenIdentifier).eq("lessonId", lesson._id).eq("key", `v:${version._id}`)).unique() : null;
    const result = { schemaVersion: 1 as const, lessonId: lesson._id, versionId: version._id, metadata: version.metadata, blocks, sources, curriculum, sourceExcerpts, progress: state ? { completedBlockIds: state.completedBlocks.filter(id => selected.has(id)) } : null, boundaries: { sourceExcerptsIncluded: sourceExcerpts.length > 0, privateNotesIncluded: false as const, outsideKnowledgeIncluded: false as const } };
    if (new TextEncoder().encode(JSON.stringify(result)).length > 100_000) throw new Error("Context exceeds 100000 bytes; narrow selection");
    return result;
}
export const assemble = query({ args: contextSelection.fields, returns: contextResult, handler: async (ctx, args) => { const { identity } = await requireActiveUser(ctx); return assembleForActor(ctx, identity, args); } });
