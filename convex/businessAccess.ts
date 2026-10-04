import type { Infer } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { teamAsset } from "./businessModel";

type Ctx = Pick<QueryCtx | MutationCtx, "db">;
export async function businessMember(ctx: Ctx, teamId: Id<"businessTeams">, userId: string) {
  return ctx.db.query("businessMembers").withIndex("by_team_user", q => q.eq("teamId", teamId).eq("userId", userId)).unique();
}
export async function hasBusinessWorkspace(ctx: Ctx, userId: string) {
  return !!await ctx.db.query("businessMembers").withIndex("by_user", q => q.eq("userId", userId)).first();
}
export async function requireBusinessWorkspace(ctx: Ctx, userId: string) {
  if (!await hasBusinessWorkspace(ctx, userId)) throw new Error("BUSINESS_REQUIRED: Create a free Business team to collaborate.");
}
async function directTeamAccess(ctx: Ctx, userId: string, asset: Infer<typeof teamAsset>) {
  const shares = await ctx.db.query("businessShares").withIndex("by_asset", q => q.eq("asset", asset)).take(21);
  if (shares.length > 20) return false;
  for (const share of shares) {
    if (await businessMember(ctx, share.teamId, userId)) return true;
  }
  return false;
}
/** Team grants are resolved at read time; revoking membership never leaves stale editor rows. */
export async function canEditTeamAsset(ctx: Ctx, userId: string, asset: Infer<typeof teamAsset>, inherit = true, depth = 0): Promise<boolean> {
  if (depth > 8) return false;
  if (await directTeamAccess(ctx, userId, asset)) return true;
  if (asset.kind === "folder") {
    const folder = await ctx.db.get("folders", asset.id);
    return !!folder?.parentId && await canEditTeamAsset(ctx, userId, { kind: "folder", id: folder.parentId }, true, depth + 1);
  }
  if (!inherit) return false;
  const folderAsset = asset.kind === "course" ? { kind: "collection" as const, id: asset.id } : asset;
  const members = await ctx.db.query("folderMembers").withIndex("by_asset", q => q.eq("asset", folderAsset)).take(101);
  if (members.length > 100) return false;
  for (const member of members) {
    if (await canEditTeamAsset(ctx, userId, { kind: "folder", id: member.folderId })) return true;
  }
  if (asset.kind === "lesson") {
    const lesson = await ctx.db.get("lessons", asset.id);
    if (!lesson) return false;
    const courses = await ctx.db.query("learnCollections").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", lesson.ownerId)).take(500);
    for (const course of courses) {
      if ((course.lessonIds ?? course.items.flatMap(item => item.kind === "lesson" ? [item.id] : [])).includes(asset.id) && await canEditTeamAsset(ctx, userId, { kind: "course", id: course._id })) return true;
    }
  }
  return false;
}
