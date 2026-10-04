import type { Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";

import type { QueryCtx, MutationCtx } from "./_generated/server";
import { canEditTeamAsset } from "./businessAccess";
import { creatorRestricted } from "./authz";

import {
  folderAsset,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_MOVE_NODES,
} from "./folderModel";

import type { PaginationOptions } from "convex/server";
type Ctx = QueryCtx | MutationCtx;
type FolderId = Id<"folders">;
const reader = (ctx: Ctx) => ctx.db;
const writer = (ctx: MutationCtx) => ctx.db;
export async function owned(ctx: Ctx, id: FolderId, ownerId: string) {
  const folder = await reader(ctx).get("folders", id);
  if (!folder || (folder.ownerId !== ownerId && (await creatorRestricted(ctx, folder.ownerId) || !await canEditTeamAsset(ctx, ownerId, { kind: "folder", id }))))
    throw new Error("FOLDER_NOT_FOUND");
  return folder;
}
async function parentDepth(
  ctx: Ctx,
  id: FolderId | null,
  ownerId: string,
  moving?: FolderId,
) {
  const seen = new Set<string>();
  let depth = 0;
  while (id !== null) {
    if (id === moving || seen.has(id)) throw new Error("FOLDER_CYCLE");
    if (++depth >= MAX_FOLDER_DEPTH) throw new Error("FOLDER_DEPTH_LIMIT");
    seen.add(id);
    id = (await owned(ctx, id, ownerId)).parentId;
  }
  return depth;
}
function nameValue(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 120) throw new Error("FOLDER_NAME_INVALID");
  return trimmed;
}
export async function assetOwned(
  ctx: Ctx,
  asset: Infer<typeof folderAsset>,
  ownerId: string,
) {
  if (asset.kind === "form") {
    const form = await ctx.db.get("forms", asset.id);
    if (form?.ownerId === ownerId) return;
  } else if (asset.kind === "quiz") {
    const quiz = await ctx.db.get("quizzes", asset.id);
    if (quiz?.creatorId === ownerId) return;
  } else if (asset.kind === "lesson") {
    const lesson = await ctx.db.get("lessons", asset.id);
    if (lesson?.ownerId === ownerId) return;
  } else if (asset.kind === "source") {
    const source = await ctx.db.get("learnSources", asset.id);
    if (source?.ownerId === ownerId && source.status !== "removed") return;
  } else if (asset.kind === "collection") {
    const collection = await ctx.db.get("learnCollections", asset.id);
    if (collection?.ownerId === ownerId) return;
  }
  throw new Error("FOLDER_ASSET_NOT_FOUND");
}

export async function createFolderForActor(
  ctx: MutationCtx,
  ownerId: string,
  args: { name: string; parentId: FolderId | null },
) {
  if (args.parentId) ownerId = (await owned(ctx, args.parentId, ownerId)).ownerId;
  await parentDepth(ctx, args.parentId, ownerId);
  const now = Date.now();
  return await writer(ctx).insert("folders", {
    ...args,
    name: nameValue(args.name),
    ownerId: ownerId,
    createdAt: now,
    updatedAt: now,
  });
}

export async function listFolderForActor(
  ctx: QueryCtx,
  ownerId: string,
  args: { parentId: FolderId | null; paginationOpts: PaginationOptions },
) {
  if (args.parentId) ownerId = (await owned(ctx, args.parentId, ownerId)).ownerId;
  return await reader(ctx)
    .query("folders")
    .withIndex("by_ownerId_and_parentId", (q) =>
      q.eq("ownerId", ownerId).eq("parentId", args.parentId),
    )
    .paginate(args.paginationOpts);
}

export async function moveFolderForActor(
  ctx: MutationCtx,
  ownerId: string,
  args: { folderId: FolderId; parentId: FolderId | null },
) {
  if ((await owned(ctx, args.folderId, ownerId)).ownerId !== ownerId) throw new Error("Only the folder owner can move it.");
  // A folder lives under its owner's tree, so it can only move into one of the owner's own folders.
  if (args.parentId && (await owned(ctx, args.parentId, ownerId)).ownerId !== ownerId) throw new Error("Move it into one of your own folders.");
  const depth = await parentDepth(ctx, args.parentId, ownerId, args.folderId);
  const queue = [{ id: args.folderId, depth: depth + 1 }];
  const seen = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (seen.has(node.id)) throw new Error("FOLDER_CYCLE");
    seen.add(node.id);
    if (node.depth > MAX_FOLDER_DEPTH) throw new Error("FOLDER_DEPTH_LIMIT");
    const remaining = MAX_FOLDER_MOVE_NODES - queue.length;
    const children = await reader(ctx)
      .query("folders")
      .withIndex("by_ownerId_and_parentId", (q) =>
        q.eq("ownerId", ownerId).eq("parentId", node.id),
      )
      .take(remaining + 1);
    if (children.length > remaining) throw new Error("FOLDER_MOVE_LIMIT");
    queue.push(
      ...children.map((child) => ({ id: child._id, depth: node.depth + 1 })),
    );
  }
  await writer(ctx).patch("folders", args.folderId, {
    parentId: args.parentId,
    updatedAt: Date.now(),
  });
  return null;
}

export async function listMembersFolderForActor(
  ctx: QueryCtx,
  ownerId: string,
  args: { folderId: FolderId; paginationOpts: PaginationOptions },
) {
  ownerId = (await owned(ctx, args.folderId, ownerId)).ownerId;
  return await reader(ctx)
    .query("folderMembers")
    .withIndex("by_ownerId_and_folderId_and_asset", (q) =>
      q.eq("ownerId", ownerId).eq("folderId", args.folderId),
    )
    .paginate(args.paginationOpts);
}

export async function addMemberFolderForActor(
  ctx: MutationCtx,
  ownerId: string,
  args: { folderId: FolderId; asset: Infer<typeof folderAsset> },
) {
  const actorId = ownerId;
  ownerId = (await owned(ctx, args.folderId, ownerId)).ownerId;
  if (actorId !== ownerId) {
    const asset = args.asset.kind === "collection" ? { kind: "course" as const, id: args.asset.id } : args.asset;
    if ((asset.kind !== "form" && asset.kind !== "lesson" && asset.kind !== "course") || !await canEditTeamAsset(ctx, actorId, asset)) throw new Error("Only accessible team resources can be added to this folder.");
  }
  await assetOwned(ctx, args.asset, ownerId);
  const existing = await reader(ctx)
    .query("folderMembers")
    .withIndex("by_ownerId_and_folderId_and_asset", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("folderId", args.folderId)
        .eq("asset", args.asset),
    )
    .unique();
  return (
    existing?._id ??
    (await writer(ctx).insert("folderMembers", {
      ...args,
      ownerId: ownerId,
      createdAt: Date.now(),
    }))
  );
}
