import type { Infer } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { teamAsset } from "./businessModel";
import { checkEmailRules, type EmailCheck } from "./formRespondent";
import { coursesWithLesson } from "./courseMembership";

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
export async function canEditTeamAsset(ctx: Ctx, userId: string, asset: Infer<typeof teamAsset>, inherit = true, depth = 0, knownLesson?: Doc<"lessons">): Promise<boolean> {
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
    const lesson = knownLesson?._id === asset.id ? knownLesson : await ctx.db.get("lessons", asset.id);
    if (!lesson) return false;
    const courses = await coursesWithLesson(ctx, lesson.ownerId, asset.id);
    for (const course of courses) {
      if ((course.lessonIds ?? course.items.flatMap(item => item.kind === "lesson" ? [item.id] : [])).includes(asset.id) && await canEditTeamAsset(ctx, userId, { kind: "course", id: course._id })) return true;
    }
  }
  return false;
}

/**
 * Team-only ("internal") content is restricted visibility bound to one Business team.
 * Only that team's members can read it; owners keep their usual access.
 */
export async function teamAudienceAllows(ctx: Ctx, row: { visibility?: string; audienceTeamId?: Id<"businessTeams"> }, userId: string | null | undefined) {
  return row.visibility === "restricted" && !!row.audienceTeamId && !!userId && !!await businessMember(ctx, row.audienceTeamId, userId);
}
/** The team a restricted publication is for. The publisher must belong to it; other visibilities carry no team. */
export async function resolveAudienceTeam(ctx: Ctx, actor: string, visibility: string, teamId?: Id<"businessTeams">, current?: Id<"businessTeams">) {
  if (visibility !== "restricted") return undefined;
  const id = teamId ?? current;
  if (!id) throw new Error("TEAM_REQUIRED: Choose the team that can see this.");
  if (!await businessMember(ctx, id, actor)) throw new Error("TEAM_ACCESS_REQUIRED: You can only share with a team you belong to.");
  return id;
}
/** Signed-in form access: the team rule (team-only forms, quizzes and games) and then any email rules. */
export async function teamOrEmailCheck(ctx: Ctx, settings: { audienceTeamId?: Id<"businessTeams">; allowedEmails?: string[]; allowedDomains?: string[] }, identity: { subject: string; email?: string; emailVerified?: boolean } | null): Promise<EmailCheck> {
  if (settings.audienceTeamId && (!identity || !await businessMember(ctx, settings.audienceTeamId, identity.subject))) return "not_allowed";
  return checkEmailRules(settings, identity);
}
