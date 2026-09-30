import { ConvexError, v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { requireIdentity, requireActiveUser } from "./authz";
import { lessonAccessForActor } from "./lessons";
import schema from "./schema";
import { personalAnchor, personalKind, PERSONAL_LIMITS } from "./learnPersonalModel";


/** Client contract: stable key per annotation; expectedRevision=0 creates.
 * Exact same retries return the current record. Reads recover only caller's
 * private data even after source access is revoked. No lesson saves/progress.
 */
export const put = mutation({
  args: { key: v.string(), lessonId: v.id("lessons"), versionId: v.id("lessonVersions"), blockId: v.string(), kind: personalKind, anchor: v.optional(personalAnchor), note: v.string(), expectedRevision: v.number() },
  returns: schema.doc("learnPersonal"),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(args.key) || args.note.length > PERSONAL_LIMITS.noteCharacters || !Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0) throw new Error("Invalid key, note length or revision");
    const lesson = await lessonAccessForActor(ctx, identity.subject, args.lessonId);
    const version = await ctx.db.get("lessonVersions", args.versionId);
    if (!version || version.lessonId !== args.lessonId || (lesson.ownerId !== identity.subject && version._id !== lesson.publishedVersionId && (lesson.visibility !== "public" || version.visibility !== "public"))) throw new Error("Lesson version not found or unauthorized");
    const block = version.document.blocks.find(b => b.id === args.blockId);
    if (!block) throw new Error("Block not found in lesson version");
    if (args.kind === "highlight" && !args.anchor) throw new Error("Highlight requires an exact selection");
    if (args.kind !== "note" && args.note) throw new Error("Only notes may contain note text");
    if (args.anchor) {
      const a = args.anchor;
      if (!("text" in block) || !Number.isSafeInteger(a.start) || !Number.isSafeInteger(a.end) || a.start < 0 || a.end <= a.start || a.end > block.text.length || !a.quote || a.quote.length > PERSONAL_LIMITS.quoteCharacters || block.text.slice(a.start, a.end) !== a.quote) throw new Error("Selection must match stored block text exactly");
    }
    const prior = await ctx.db.query("learnPersonal").withIndex("by_owner_and_key", q => q.eq("owner", identity.tokenIdentifier).eq("key", args.key)).unique();
    const payload = { lessonId: args.lessonId, versionId: args.versionId, blockId: args.blockId, kind: args.kind, note: args.note, ...(args.anchor ? { anchor: args.anchor } : {}) };
    if (prior && !prior.deleted && prior.lessonId === args.lessonId && prior.versionId === args.versionId && prior.blockId === args.blockId && prior.kind === args.kind && prior.note === args.note && JSON.stringify(prior.anchor) === JSON.stringify(args.anchor)) return prior;
    if ((prior?.revision ?? 0) !== args.expectedRevision) throw new ConvexError({ code: "REVISION_CONFLICT", currentRevision: prior?.revision ?? 0 });
    if (!prior) {
      const rows = await ctx.db.query("learnPersonal").withIndex("by_owner_and_lessonId", q => q.eq("owner", identity.tokenIdentifier).eq("lessonId", args.lessonId)).take(PERSONAL_LIMITS.perLesson);
      if (rows.length >= PERSONAL_LIMITS.perLesson) throw new Error("Personal annotation limit reached");
    } else if (prior.lessonId !== args.lessonId) throw new Error("Annotation keys cannot move between lessons");
    const record = { ...payload, owner: identity.tokenIdentifier, key: args.key, revision: (prior?.revision ?? 0) + 1, updatedAt: Date.now(), deleted: false };
    const id = prior ? prior._id : await ctx.db.insert("learnPersonal", record);
    if (prior) await ctx.db.replace("learnPersonal", id, record);
    return (await ctx.db.get("learnPersonal", id))!;
  },
});
export const list = query({ args: { lessonId: v.id("lessons"), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("learnPersonal")), handler: async (ctx, args) => {
  const identity = await requireIdentity(ctx);
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > PERSONAL_LIMITS.pageSize) throw new Error("Page size must be 1–100");
  return ctx.db.query("learnPersonal").withIndex("by_owner_and_lessonId", q => q.eq("owner", identity.tokenIdentifier).eq("lessonId", args.lessonId)).paginate(args.paginationOpts);
} });
export const remove = mutation({ args: { key: v.string(), expectedRevision: v.number() }, returns: v.number(), handler: async (ctx, args) => {
  const identity = await requireIdentity(ctx);
  const prior = await ctx.db.query("learnPersonal").withIndex("by_owner_and_key", q => q.eq("owner", identity.tokenIdentifier).eq("key", args.key)).unique();
  if (!prior) return 0;
  if (prior.deleted) return prior.revision;
  if (prior.revision !== args.expectedRevision) throw new ConvexError({ code: "REVISION_CONFLICT", currentRevision: prior.revision });
  await ctx.db.patch("learnPersonal", prior._id, { deleted: true, note: "", anchor: undefined, revision: prior.revision + 1, updatedAt: Date.now() });
  return prior.revision + 1;
} });
export const followModule = mutation({ args: { nodeId: v.id("curriculumNodes"), followed: v.boolean(), expectedRevision: v.number() }, returns: v.number(), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx);
  if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0) throw new Error("Invalid revision");
  if (args.followed && !(await ctx.db.get("curriculumNodes", args.nodeId))) throw new Error("Curriculum node not found");
  const prior = await ctx.db.query("learnModuleFollows").withIndex("by_owner_and_nodeId", q => q.eq("owner", identity.tokenIdentifier).eq("nodeId", args.nodeId)).unique();
  if (prior?.followed === args.followed) return prior.revision;
  if ((prior?.revision ?? 0) !== args.expectedRevision) throw new ConvexError({ code: "REVISION_CONFLICT", currentRevision: prior?.revision ?? 0 });
  if (!prior && (await ctx.db.query("learnModuleFollows").withIndex("by_owner_and_nodeId", q => q.eq("owner", identity.tokenIdentifier)).take(PERSONAL_LIMITS.follows)).length >= PERSONAL_LIMITS.follows) throw new Error("Module follow limit reached");
  const revision = (prior?.revision ?? 0) + 1;
  if (prior) await ctx.db.patch("learnModuleFollows", prior._id, { followed: args.followed, revision });
  else await ctx.db.insert("learnModuleFollows", { owner: identity.tokenIdentifier, nodeId: args.nodeId, followed: args.followed, revision });
  return revision;
} });
export const listModuleFollows = query({ args: {}, returns: v.array(schema.doc("learnModuleFollows")), handler: async ctx => {
  const identity = await requireIdentity(ctx);
  return ctx.db.query("learnModuleFollows").withIndex("by_owner_and_nodeId", q => q.eq("owner", identity.tokenIdentifier)).take(PERSONAL_LIMITS.follows);
} });
