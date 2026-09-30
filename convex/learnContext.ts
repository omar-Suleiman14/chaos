import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireActiveUser, creatorRestricted } from "./authz";
import { lessonAccess } from "./lessons";
import { lessonBlock, lessonMeta, sourceMetadata } from "./learnModel";
/** Controlled export only. This module neither calls a model nor sends data to a provider. */
export const assemble = query({
  args: { lessonId: v.id("lessons"), versionId: v.id("lessonVersions"), blockIds: v.array(v.string()), sourceIds: v.array(v.id("learnSources")), includeMyProgress: v.boolean() },
  returns: v.object({ schemaVersion: v.literal(1), lessonId: v.id("lessons"), versionId: v.id("lessonVersions"), metadata: lessonMeta, blocks: v.array(lessonBlock), sources: v.array(v.object({ id: v.id("learnSources"), metadata: sourceMetadata, includesContent: v.literal(false) })), progress: v.union(v.null(), v.object({ completedBlockIds: v.array(v.string()) })), boundaries: v.object({ sourceExcerptsIncluded: v.literal(false), privateNotesIncluded: v.literal(false), outsideKnowledgeIncluded: v.literal(false) }) }),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx); const lesson = await lessonAccess(ctx, args.lessonId); const version = await ctx.db.get("lessonVersions", args.versionId);
    if (!version || version.lessonId !== lesson._id || (lesson.ownerId !== identity.subject && (lesson.publishedVersionId !== version._id || lesson.status !== "active" || lesson.communityState !== "ok"))) throw new Error("Lesson version not accessible");
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
    const state = args.includeMyProgress ? await ctx.db.query("learnProgress").withIndex("by_userKey_and_lessonId_and_key", q => q.eq("userKey", identity.tokenIdentifier).eq("lessonId", lesson._id).eq("key", `v:${version._id}`)).unique() : null;
    return { schemaVersion: 1 as const, lessonId: lesson._id, versionId: version._id, metadata: version.metadata, blocks, sources, progress: state ? { completedBlockIds: state.completedBlocks.filter(id => selected.has(id)) } : null, boundaries: { sourceExcerptsIncluded: false as const, privateNotesIncluded: false as const, outsideKnowledgeIncluded: false as const } };
  },
});
