import {
  docValidator,
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v, type Infer } from "convex/values";
import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdmin, requireActiveUser, requireIdentity } from "./authz";
import { curriculumTables, nodeKind } from "./curriculumModel";
function text(value: string) {
  const result = value.trim();
  if (!result || result.length > 200) throw new Error("Invalid name or key");
  return result;
}
function key(value: string) {
  return text(value).toLowerCase();
}
function strings(values: string[]) {
  if (
    values.length > 100 ||
    new Set(values).size !== values.length ||
    values.some((x) => text(x) !== x)
  )
    throw new Error("Invalid coverage");
  return values;
}
async function admin(ctx: MutationCtx) {
  await requireActiveUser(ctx);
  await requireAdmin(ctx);
}
async function ownedLesson(
  ctx: QueryCtx | MutationCtx,
  lessonId: Id<"lessons">,
  write = false,
) {
  const identity = write
    ? (await requireActiveUser(ctx)).identity
    : await requireIdentity(ctx);
  const lesson = await ctx.db.get("lessons", lessonId);
  if (!lesson || lesson.ownerId !== identity.subject)
    throw new Error("Lesson not found or unauthorized");
  return lesson;
}

// Canonical records deliberately have no update/delete API. New editions get new IDs.
export const createInstitution = mutation({
  args: { key: v.string(), name: v.string() },
  returns: v.id("curriculumInstitutions"),
  handler: async (ctx, args) => {
    await admin(ctx);
    const canonicalKey = key(args.key);
    if (
      await ctx.db
        .query("curriculumInstitutions")
        .withIndex("by_key", (q) => q.eq("key", canonicalKey))
        .unique()
    )
      throw new Error("Duplicate institution key");
    return ctx.db.insert("curriculumInstitutions", {
      key: canonicalKey,
      name: text(args.name),
    });
  },
});
export const createProgram = mutation({
  args: {
    institutionId: v.id("curriculumInstitutions"),
    key: v.string(),
    name: v.string(),
  },
  returns: v.id("curriculumPrograms"),
  handler: async (ctx, args) => {
    await admin(ctx);
    if (!(await ctx.db.get("curriculumInstitutions", args.institutionId)))
      throw new Error("Institution not found");
    const canonicalKey = key(args.key);
    if (
      await ctx.db
        .query("curriculumPrograms")
        .withIndex("by_institutionId_and_key", (q) =>
          q.eq("institutionId", args.institutionId).eq("key", canonicalKey),
        )
        .unique()
    )
      throw new Error("Duplicate program key");
    return ctx.db.insert("curriculumPrograms", {
      ...args,
      key: canonicalKey,
      name: text(args.name),
    });
  },
});
export const createVersion = mutation({
  args: {
    programId: v.id("curriculumPrograms"),
    key: v.string(),
    name: v.string(),
  },
  returns: v.id("curriculumVersions"),
  handler: async (ctx, args) => {
    await admin(ctx);
    if (!(await ctx.db.get("curriculumPrograms", args.programId)))
      throw new Error("Program not found");
    const canonicalKey = key(args.key);
    if (
      await ctx.db
        .query("curriculumVersions")
        .withIndex("by_programId_and_key", (q) =>
          q.eq("programId", args.programId).eq("key", canonicalKey),
        )
        .unique()
    )
      throw new Error("Duplicate version key");
    return ctx.db.insert("curriculumVersions", {
      ...args,
      key: canonicalKey,
      name: text(args.name),
    });
  },
});
export const createNode = mutation({
  args: {
    versionId: v.id("curriculumVersions"),
    parentId: v.union(v.id("curriculumNodes"), v.null()),
    key: v.string(),
    name: v.string(),
    kind: nodeKind,
    conceptKeys: v.array(v.string()),
  },
  returns: v.id("curriculumNodes"),
  handler: async (ctx, args) => {
    await admin(ctx);
    if (!(await ctx.db.get("curriculumVersions", args.versionId)))
      throw new Error("Version not found");
    if (args.parentId) {
      const parent = await ctx.db.get("curriculumNodes", args.parentId);
      if (!parent || parent.versionId !== args.versionId)
        throw new Error("Parent version mismatch");
    }
    const canonicalKey = key(args.key);
    if (
      await ctx.db
        .query("curriculumNodes")
        .withIndex("by_versionId_and_key", (q) =>
          q.eq("versionId", args.versionId).eq("key", canonicalKey),
        )
        .unique()
    )
      throw new Error("Duplicate node key");
    return ctx.db.insert("curriculumNodes", {
      ...args,
      key: canonicalKey,
      name: text(args.name),
      conceptKeys: strings(args.conceptKeys),
    });
  },
});
const target = curriculumTables.curriculumAliases.validator.fields.targetId;
async function aliasScope(
  ctx: QueryCtx,
  targetId:
    | Id<"curriculumInstitutions">
    | Id<"curriculumPrograms">
    | Id<"curriculumVersions">
    | Id<"curriculumNodes">,
) {
  const institutionId = ctx.db.normalizeId("curriculumInstitutions", targetId);
  const programId = ctx.db.normalizeId("curriculumPrograms", targetId);
  const versionId = ctx.db.normalizeId("curriculumVersions", targetId);
  const nodeId = ctx.db.normalizeId("curriculumNodes", targetId);
  const row = institutionId
    ? await ctx.db.get("curriculumInstitutions", institutionId)
    : programId
      ? await ctx.db.get("curriculumPrograms", programId)
      : versionId
        ? await ctx.db.get("curriculumVersions", versionId)
        : nodeId
          ? await ctx.db.get("curriculumNodes", nodeId)
          : null;
  if (!row) throw new Error("Alias target not found");
  if ("versionId" in row) return `nodes:${row.versionId}`;
  if ("programId" in row) return `versions:${row.programId}`;
  if ("institutionId" in row) return `programs:${row.institutionId}`;
  return "institutions";
}
export const addAlias = mutation({
  args: { targetId: target, alias: v.string() },
  returns: v.id("curriculumAliases"),
  handler: async (ctx, args) => {
    await admin(ctx);
    const scope = await aliasScope(ctx, args.targetId),
      alias = key(args.alias);
    const existing = await ctx.db
      .query("curriculumAliases")
      .withIndex("by_scope_and_alias", (q) =>
        q.eq("scope", scope).eq("alias", alias),
      )
      .unique();
    if (existing) {
      if (existing.targetId !== args.targetId)
        throw new Error("Alias already assigned");
      return existing._id;
    }
    return ctx.db.insert("curriculumAliases", {
      scope,
      alias,
      targetId: args.targetId,
    });
  },
});
export const resolveAlias = query({
  args: { scope: v.string(), alias: v.string() },
  returns: v.union(
    docValidator("curriculumAliases", curriculumTables.curriculumAliases),
    v.null(),
  ),
  handler: async (ctx, args) =>
    ctx.db
      .query("curriculumAliases")
      .withIndex("by_scope_and_alias", (q) =>
        q.eq("scope", args.scope).eq("alias", key(args.alias)),
      )
      .unique(),
});
export const listInstitutions = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    docValidator(
      "curriculumInstitutions",
      curriculumTables.curriculumInstitutions,
    ),
  ),
  handler: (ctx, args) =>
    ctx.db
      .query("curriculumInstitutions")
      .withIndex("by_key")
      .paginate(args.paginationOpts),
});
export const listPrograms = query({
  args: {
    institutionId: v.id("curriculumInstitutions"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    docValidator("curriculumPrograms", curriculumTables.curriculumPrograms),
  ),
  handler: (ctx, args) =>
    ctx.db
      .query("curriculumPrograms")
      .withIndex("by_institutionId_and_key", (q) =>
        q.eq("institutionId", args.institutionId),
      )
      .paginate(args.paginationOpts),
});
export const listVersions = query({
  args: {
    programId: v.id("curriculumPrograms"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    docValidator("curriculumVersions", curriculumTables.curriculumVersions),
  ),
  handler: (ctx, args) =>
    ctx.db
      .query("curriculumVersions")
      .withIndex("by_programId_and_key", (q) =>
        q.eq("programId", args.programId),
      )
      .paginate(args.paginationOpts),
});
export const listNodes = query({
  args: {
    versionId: v.id("curriculumVersions"),
    parentId: v.optional(v.union(v.id("curriculumNodes"), v.null())),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    docValidator("curriculumNodes", curriculumTables.curriculumNodes),
  ),
  handler: (ctx, args) =>
    args.parentId === undefined
      ? ctx.db
          .query("curriculumNodes")
          .withIndex("by_versionId_and_key", (q) =>
            q.eq("versionId", args.versionId),
          )
          .paginate(args.paginationOpts)
      : ctx.db
          .query("curriculumNodes")
          .withIndex("by_versionId_and_parentId", (q) =>
            q.eq("versionId", args.versionId).eq("parentId", args.parentId!),
          )
          .paginate(args.paginationOpts),
});
export const createLessonMapping = mutation({
  args: {
    lessonId: v.id("lessons"),
    versionId: v.id("curriculumVersions"),
    nodeId: v.id("curriculumNodes"),
    conceptKeys: v.array(v.string()),
    blockIds: v.array(v.string()),
  },
  returns: v.id("lessonCurriculumMappings"),
  handler: async (ctx, args) => createLessonMappingForActor(ctx, (await requireActiveUser(ctx)).identity.subject, args),
});
export async function createLessonMappingForActor(ctx: MutationCtx, actorId: string, args: Infer<typeof curriculumTables.lessonCurriculumMappings.validator>) {
    const lesson = await ctx.db.get("lessons", args.lessonId);
    if (!lesson || lesson.ownerId !== actorId) throw new Error("Lesson not found or unauthorized");
    const node = await ctx.db.get("curriculumNodes", args.nodeId);
    if (
      !node ||
      node.versionId !== args.versionId ||
      !(await ctx.db.get("curriculumVersions", args.versionId))
    )
      throw new Error("Node version mismatch");
    strings(args.conceptKeys);
    strings(args.blockIds);
    if (!args.conceptKeys.length && !args.blockIds.length)
      throw new Error("Coverage required");
    if (args.conceptKeys.some((x) => !node.conceptKeys.includes(x)))
      throw new Error("Unknown concept");
    if (
      lesson.draft.schemaVersion !== 1 ||
      args.blockIds.some(
        (id) => !lesson.draft.blocks.some((block) => block.id === id),
      )
    )
      throw new Error("Invalid draft block ID");
    if (
      await ctx.db
        .query("lessonCurriculumMappings")
        .withIndex("by_lessonId_and_nodeId", (q) =>
          q.eq("lessonId", args.lessonId).eq("nodeId", args.nodeId),
        )
        .unique()
    )
      throw new Error("Mapping already exists");
    return ctx.db.insert("lessonCurriculumMappings", args);
}
export const removeLessonMapping = mutation({
  args: { mappingId: v.id("lessonCurriculumMappings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);
    const mapping = await ctx.db.get(
      "lessonCurriculumMappings",
      args.mappingId,
    );
    if (!mapping) throw new Error("Mapping not found or unauthorized");
    await ownedLesson(ctx, mapping.lessonId, true);
    await ctx.db.delete("lessonCurriculumMappings", args.mappingId);
    return null;
  },
});
export const listLessonMappings = query({
  args: { lessonId: v.id("lessons"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    docValidator(
      "lessonCurriculumMappings",
      curriculumTables.lessonCurriculumMappings,
    ),
  ),
  handler: async (ctx, args) => {
    await ownedLesson(ctx, args.lessonId);
    return ctx.db
      .query("lessonCurriculumMappings")
      .withIndex("by_lessonId_and_nodeId", (q) =>
        q.eq("lessonId", args.lessonId),
      )
      .paginate(args.paginationOpts);
  },
});
