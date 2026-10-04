import { defineTable, docValidator } from "convex/server";
import { v } from "convex/values";

export const MAX_FOLDER_DEPTH = 8;
export const MAX_FOLDER_MOVE_NODES = 256;
// Collections deliberately fail closed until a server ownership adapter exists.
export const folderAsset = v.union(
  v.object({ kind: v.literal("form"), id: v.id("forms") }),
  v.object({ kind: v.literal("quiz"), id: v.id("quizzes") }),
  v.object({ kind: v.literal("lesson"), id: v.id("lessons") }),
  v.object({ kind: v.literal("source"), id: v.id("learnSources") }),
  v.object({ kind: v.literal("collection"), id: v.id("learnCollections") }),
);
export const folderTables = {
  folders: defineTable({
    ownerId: v.string(), name: v.string(), parentId: v.union(v.id("folders"), v.null()),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_ownerId_and_parentId", ["ownerId", "parentId"]),
  folderMembers: defineTable({
    ownerId: v.string(), folderId: v.id("folders"), asset: folderAsset, createdAt: v.number(),
  }).index("by_ownerId_and_folderId_and_asset", ["ownerId", "folderId", "asset"]).index("by_asset", ["asset"]),
};
export const folderDoc = docValidator("folders", folderTables.folders);
export const folderMemberDoc = docValidator("folderMembers", folderTables.folderMembers);
