import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireActiveUser } from "./authz";
import { folderAsset, folderDoc, folderMemberDoc } from "./folderModel";
import { owned, createFolderForActor, listFolderForActor, moveFolderForActor, listMembersFolderForActor, addMemberFolderForActor } from "./folderServices";
export const create = mutation({ args: { name: v.string(), parentId: v.union(v.id("folders"), v.null()) }, returns: v.id("folders"), handler: async (ctx, args) => createFolderForActor(ctx, (await requireActiveUser(ctx)).identity.subject, args) });
export const list = query({ args: { parentId: v.union(v.id("folders"), v.null()), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(folderDoc), handler: async (ctx, args) => listFolderForActor(ctx, (await requireActiveUser(ctx)).identity.subject, args) });
export const move = mutation({ args: { folderId: v.id("folders"), parentId: v.union(v.id("folders"), v.null()) }, returns: v.null(), handler: async (ctx, args) => moveFolderForActor(ctx, (await requireActiveUser(ctx)).identity.subject, args) });
export const listMembers = query({ args: { folderId: v.id("folders"), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(folderMemberDoc), handler: async (ctx, args) => listMembersFolderForActor(ctx, (await requireActiveUser(ctx)).identity.subject, args) });
export const addMember = mutation({ args: { folderId: v.id("folders"), asset: folderAsset }, returns: v.id("folderMembers"), handler: async (ctx, args) => addMemberFolderForActor(ctx, (await requireActiveUser(ctx)).identity.subject, args) });
export const rename = mutation({ args: { folderId: v.id("folders"), name: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); await owned(ctx, args.folderId, identity.subject);
  const name = args.name.trim(); if (!name || name.length > 120) throw new Error("FOLDER_NAME_INVALID");
  await ctx.db.patch("folders", args.folderId, { name, updatedAt: Date.now() }); return null;
} });
export const remove = mutation({ args: { folderId: v.id("folders") }, returns: v.null(), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx);
  if ((await owned(ctx, args.folderId, identity.subject)).ownerId !== identity.subject) throw new Error("Only the folder owner can remove it.");
  const child = await ctx.db.query("folders").withIndex("by_ownerId_and_parentId", q => q.eq("ownerId", identity.subject).eq("parentId", args.folderId)).first();
  const member = await ctx.db.query("folderMembers").withIndex("by_ownerId_and_folderId_and_asset", q => q.eq("ownerId", identity.subject).eq("folderId", args.folderId)).first();
  if (child || member) throw new Error("FOLDER_NOT_EMPTY"); await ctx.db.delete("folders", args.folderId); return null;
} });
export const removeMember = mutation({ args: { memberId: v.id("folderMembers") }, returns: v.null(), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); const member = await ctx.db.get("folderMembers", args.memberId);
  if (!member) throw new Error("FOLDER_MEMBER_NOT_FOUND");
  // Team editors of a shared folder may remove items too; anyone else learns nothing about the folder.
  try { await owned(ctx, member.folderId, identity.subject); } catch { throw new Error("FOLDER_MEMBER_NOT_FOUND"); }
  await ctx.db.delete("folderMembers", member._id); return null;
} });
