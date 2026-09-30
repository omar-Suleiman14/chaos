import { createLessonMappingForActor } from "./curricula";
import type { PaginationResult } from "convex/server";
import type { Doc } from "./_generated/dataModel";
// Trusted actor comes only from the secret-protected HTTP envelope; Pro is gated by transport begin.
import { v } from "convex/values";
import {
  docValidator,
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { internalQuery, internalMutation } from "./_generated/server";
import { api } from "./_generated/api";
import { requireLearnActor } from "./mcpLearn";
import { folderAsset, folderDoc, folderMemberDoc } from "./folderModel";
import {
  createFolderForActor,
  listFolderForActor,
  moveFolderForActor,
  listMembersFolderForActor,
  addMemberFolderForActor,
  assetOwned,
} from "./folderServices";
import { curriculumTables } from "./curriculumModel";
const actor = { userId: v.string() };
const parentId = v.union(v.id("folders"), v.null());
export const createFolder = internalMutation({
  args: { ...actor, name: v.string(), parentId },
  returns: v.id("folders"),
  handler: async (ctx, args) => {
    const ownerId = await requireLearnActor(ctx, args.userId);
    const { userId: _actor, ...input } = args;
    const result = await createFolderForActor(ctx, ownerId, input);
    return result;
  },
});
export const listFolders = internalQuery({
  args: { ...actor, parentId, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(folderDoc),
  handler: async (ctx, args) => {
    const ownerId = await requireLearnActor(ctx, args.userId);
    const { userId: _actor, ...input } = args;
    const result = await listFolderForActor(ctx, ownerId, input);
    return result;
  },
});
export const moveFolder = internalMutation({
  args: { ...actor, folderId: v.id("folders"), parentId },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireLearnActor(ctx, args.userId);
    const { userId: _actor, ...input } = args;
    const result = await moveFolderForActor(ctx, ownerId, input);
    return result;
  },
});
export const listFolderContents = internalQuery({
  args: {
    ...actor,
    folderId: v.id("folders"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(folderMemberDoc),
  handler: async (ctx, args) => {
    const ownerId = await requireLearnActor(ctx, args.userId);
    const { userId: _actor, ...input } = args;
    const result = await listMembersFolderForActor(ctx, ownerId, input);
    const page = [];
    for (const member of result.page) {
      try {
        await assetOwned(ctx, member.asset, ownerId);
        page.push(member);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.message !== "FOLDER_ASSET_NOT_FOUND"
        )
          throw error;
      }
    }
    return { ...result, page };
  },
});
export const addFolderMember = internalMutation({
  args: { ...actor, folderId: v.id("folders"), asset: folderAsset },
  returns: v.id("folderMembers"),
  handler: async (ctx, args) => {
    const ownerId = await requireLearnActor(ctx, args.userId);
    const { userId: _actor, ...input } = args;
    const result = await addMemberFolderForActor(ctx, ownerId, input);
    return result;
  },
});
export const listInstitutions = internalQuery({
  args: { ...actor, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    docValidator(
      "curriculumInstitutions",
      curriculumTables.curriculumInstitutions,
    ),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<PaginationResult<Doc<"curriculumInstitutions">>> => {
    await requireLearnActor(ctx, args.userId);
    const { userId: _actor, ...input } = args;
    return await ctx.runQuery(api.curricula.listInstitutions, input);
  },
});
export const listPrograms = internalQuery({
  args: {
    ...actor,
    institutionId: v.id("curriculumInstitutions"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    docValidator("curriculumPrograms", curriculumTables.curriculumPrograms),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<PaginationResult<Doc<"curriculumPrograms">>> => {
    await requireLearnActor(ctx, args.userId);
    const { userId: _actor, ...input } = args;
    return await ctx.runQuery(api.curricula.listPrograms, input);
  },
});
export const listVersions = internalQuery({
  args: {
    ...actor,
    programId: v.id("curriculumPrograms"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    docValidator("curriculumVersions", curriculumTables.curriculumVersions),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<PaginationResult<Doc<"curriculumVersions">>> => {
    await requireLearnActor(ctx, args.userId);
    const { userId: _actor, ...input } = args;
    return await ctx.runQuery(api.curricula.listVersions, input);
  },
});
export const listNodes = internalQuery({
  args: {
    ...actor,
    versionId: v.id("curriculumVersions"),
    parentId: v.optional(v.union(v.id("curriculumNodes"), v.null())),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    docValidator("curriculumNodes", curriculumTables.curriculumNodes),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<PaginationResult<Doc<"curriculumNodes">>> => {
    await requireLearnActor(ctx, args.userId);
    if (args.parentId) {
      const parent = await ctx.db.get("curriculumNodes", args.parentId);
      if (!parent || parent.versionId !== args.versionId)
        throw new Error("Parent version mismatch");
    }
    const { userId: _actor, ...input } = args;
    return await ctx.runQuery(api.curricula.listNodes, input);
  },
});
export const createLessonMapping = internalMutation({
  args: { ...actor, ...curriculumTables.lessonCurriculumMappings.validator.fields },
  returns: v.id("lessonCurriculumMappings"),
  handler: async (ctx, args) => {
    const ownerId = await requireLearnActor(ctx, args.userId);
    const { userId: _actor, ...input } = args;
    return createLessonMappingForActor(ctx, ownerId, input);
  },
});
