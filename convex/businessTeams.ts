import { v, type Infer } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { ObjectType } from "convex/values";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { requireActiveUser, creatorRestricted } from "./authz";
import { businessMember } from "./businessAccess";
import { inviteRole, teamAsset, teamRole } from "./businessModel";
import { consumeRate, randomHex, sha256Hex } from "./serverUtils";
import { planCatalog } from "../lib/planCatalog";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { owned, listMembersFolderForActor } from "./folderServices";

type Ctx = QueryCtx | MutationCtx;
const verifiedEmail = (identity: { email?: string; emailVerified?: boolean }) => identity.emailVerified === true ? identity.email?.trim().toLowerCase() : undefined;
/** The signed-in caller, or a server-verified MCP actor when actorId is given. */
async function actorOf(ctx: Ctx, actorId?: string) {
  if (actorId === undefined) return requireActiveUser(ctx);
  const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", actorId)).first();
  if (!user) throw new Error("ACCOUNT_REQUIRED: Sign in to Chaos first.");
  if (user.isBanned || user.suspendedUntil) throw new Error("ACCOUNT_RESTRICTED: This Chaos account is read-only.");
  // MCP transports carry an account ID only, never a verified email.
  return { identity: { subject: actorId } as { subject: string; email?: string; emailVerified?: boolean }, user };
}
async function memberAccess(ctx: Ctx, actorId: string | undefined, teamId: Id<"businessTeams">, manage = false) {
  const { identity, user } = await actorOf(ctx, actorId);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Finish signing in first.");
  const member = await businessMember(ctx, teamId, identity.subject);
  const team = await ctx.db.get("businessTeams", teamId);
  if (!team || !member || (manage && member.role === "member")) throw new Error("TEAM_ACCESS_REQUIRED: Team not found or you do not have access.");
  return { identity, user, member, team };
}
async function record(ctx: MutationCtx, teamId: Id<"businessTeams">, actorId: string, action: string, detail: string) {
  await ctx.db.insert("businessActivity", { teamId, actorId, action, detail, createdAt: Date.now() });
}
const nameValue = (name: string) => {
  const value = name.trim();
  if (!value || value.length > 120) throw new Error("Give your team a name of up to 120 characters.");
  return value;
};
async function join(ctx: MutationCtx, teamId: Id<"businessTeams">, userId: string, role: "admin" | "member") {
  if (await businessMember(ctx, teamId, userId)) return;
  if ((await ctx.db.query("businessMembers").withIndex("by_team_user", q => q.eq("teamId", teamId)).take(101)).length >= 100) throw new Error("TEAM_MEMBER_LIMIT: A team supports up to 100 members.");
  if ((await ctx.db.query("businessMembers").withIndex("by_user", q => q.eq("userId", userId)).take(21)).length >= 20) throw new Error("TEAM_LIMIT: An account supports up to 20 teams.");
  await ctx.db.insert("businessMembers", { teamId, userId, role, joinedAt: Date.now() });
  await record(ctx, teamId, userId, "joined", role);
}
const listArgs = {};
export async function listForActor(ctx: QueryCtx, actorId: string | undefined, args: ObjectType<typeof listArgs>) {
  const { identity } = await actorOf(ctx, actorId);
  const memberships = await ctx.db.query("businessMembers").withIndex("by_user", q => q.eq("userId", identity.subject)).take(20);
  const result = [];
  for (const member of memberships) {
    const team = await ctx.db.get("businessTeams", member.teamId);
    if (team) result.push({ team, role: member.role });
  }
  return result;
}
export const list = query({ args: listArgs, returns: v.array(v.object({ team: schema.doc("businessTeams"), role: teamRole })), handler: (ctx, args) => listForActor(ctx, undefined, args) });
const createArgs = { name: v.string() };
export async function createForActor(ctx: MutationCtx, actorId: string | undefined, args: ObjectType<typeof createArgs>) {
  const { identity, user } = await actorOf(ctx, actorId);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Finish signing in first.");
  if (!planCatalog.pro.promotion.active) throw new Error("Business team registration is currently closed.");
  await consumeRate(ctx, `business:create:${identity.subject}`, 5, 3_600_000);
  if ((await ctx.db.query("businessMembers").withIndex("by_user", q => q.eq("userId", identity.subject)).take(21)).length >= 20) throw new Error("TEAM_LIMIT: An account supports up to 20 teams.");
  const teamId = await ctx.db.insert("businessTeams", { name: nameValue(args.name), ownerId: identity.subject, createdAt: Date.now() });
  await ctx.db.insert("businessMembers", { teamId, userId: identity.subject, role: "owner", joinedAt: Date.now() });
  await record(ctx, teamId, identity.subject, "created", args.name.trim());
  return teamId;
}
export const create = mutation({ args: createArgs, returns: v.id("businessTeams"), handler: (ctx, args) => createForActor(ctx, undefined, args) });
const renameArgs = { teamId: v.id("businessTeams"), name: v.string() };
export async function renameForActor(ctx: MutationCtx, actorId: string | undefined, args: ObjectType<typeof renameArgs>) {
  const { identity } = await memberAccess(ctx, actorId, args.teamId, true);
  await ctx.db.patch("businessTeams", args.teamId, { name: nameValue(args.name) });
  await record(ctx, args.teamId, identity.subject, "renamed", args.name.trim()); return null;
}
export const rename = mutation({ args: renameArgs, returns: v.null(), handler: (ctx, args) => renameForActor(ctx, undefined, args) });
const membersArgs = { teamId: v.id("businessTeams") };
export async function membersForActor(ctx: QueryCtx, actorId: string | undefined, args: ObjectType<typeof membersArgs>) {
  await memberAccess(ctx, actorId, args.teamId);
  const rows = await ctx.db.query("businessMembers").withIndex("by_team_user", q => q.eq("teamId", args.teamId)).take(100);
  return Promise.all(rows.map(async row => { const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", row.userId)).first(); return { id: row._id, userId: row.userId, role: row.role, name: user?.name ?? "Former account", email: user?.email ?? "", joinedAt: row.joinedAt }; }));
}
export const members = query({ args: membersArgs, returns: v.array(v.object({ id: v.id("businessMembers"), userId: v.string(), name: v.string(), email: v.string(), role: teamRole, joinedAt: v.number() })), handler: (ctx, args) => membersForActor(ctx, undefined, args) });
const changeRoleArgs = { teamId: v.id("businessTeams"), userId: v.string(), role: teamRole };
export async function changeRoleForActor(ctx: MutationCtx, actorId: string | undefined, args: ObjectType<typeof changeRoleArgs>) {
  const { identity, member, team } = await memberAccess(ctx, actorId, args.teamId, true);
  const target = await businessMember(ctx, args.teamId, args.userId);
  if (!target) throw new Error("Member not found.");
  if (target.role === "owner") throw new Error("Transfer ownership to another member first.");
  if (member.role !== "owner" && (target.role === "admin" || args.role !== "member")) throw new Error("Only the owner can assign administrators or transfer ownership.");
  if (args.role === "owner") {
    if (team.ownerId !== identity.subject) throw new Error("Only the owner can transfer ownership.");
    await ctx.db.patch("businessMembers", member._id, { role: "admin" });
    await ctx.db.patch("businessTeams", team._id, { ownerId: target.userId });
  }
  await ctx.db.patch("businessMembers", target._id, { role: args.role });
  await record(ctx, args.teamId, identity.subject, "role_changed", `${target.userId}: ${args.role}`); return null;
}
export const changeRole = mutation({ args: changeRoleArgs, returns: v.null(), handler: (ctx, args) => changeRoleForActor(ctx, undefined, args) });
const removeMemberArgs = { teamId: v.id("businessTeams"), userId: v.string() };
export async function removeMemberForActor(ctx: MutationCtx, actorId: string | undefined, args: ObjectType<typeof removeMemberArgs>) {
  const { identity, member } = await memberAccess(ctx, actorId, args.teamId);
  const target = await businessMember(ctx, args.teamId, args.userId);
  if (!target) return null;
  if (target.role === "owner") throw new Error("The owner must transfer ownership before leaving.");
  if (identity.subject !== args.userId && (member.role === "member" || (member.role === "admin" && target.role === "admin"))) throw new Error("You cannot remove this member.");
  await ctx.db.delete("businessMembers", target._id);
  for (const share of await ctx.db.query("businessShares").withIndex("by_team_asset", q => q.eq("teamId", args.teamId)).take(100)) {
    if (share.ownerId === target.userId) await ctx.db.delete("businessShares", share._id);
  }
  await record(ctx, args.teamId, identity.subject, "member_removed", args.userId); return null;
}
export const removeMember = mutation({ args: removeMemberArgs, returns: v.null(), handler: (ctx, args) => removeMemberForActor(ctx, undefined, args) });
const inviteArgs = { teamId: v.id("businessTeams"), email: v.optional(v.string()), role: inviteRole };
export async function inviteForActor(ctx: MutationCtx, actorId: string | undefined, args: ObjectType<typeof inviteArgs>) {
  const { identity, member } = await memberAccess(ctx, actorId, args.teamId, true);
  if (args.role === "admin" && member.role !== "owner") throw new Error("Only the owner can invite an administrator.");
  const email = args.email?.trim().toLowerCase() || undefined;
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new Error("Enter a valid email address.");
  await consumeRate(ctx, `business:invite:${identity.subject}`, 30, 3_600_000);
  if ((await ctx.db.query("businessInvites").withIndex("by_team", q => q.eq("teamId", args.teamId)).take(101)).length >= 100) throw new Error("Revoke unused invitations before creating more.");
  const token = randomHex(32), expiresAt = Date.now() + 7 * 86_400_000;
  const inviteId = await ctx.db.insert("businessInvites", { teamId: args.teamId, email, tokenHash: await sha256Hex(token), role: args.role, invitedBy: identity.subject, expiresAt, createdAt: Date.now() });
  await record(ctx, args.teamId, identity.subject, "invited", `${email ?? "Single-use link"}: ${args.role}`);
  return { inviteId, token, expiresAt };
}
export const invite = mutation({ args: inviteArgs, returns: v.object({ inviteId: v.id("businessInvites"), token: v.string(), expiresAt: v.number() }), handler: (ctx, args) => inviteForActor(ctx, undefined, args) });
const inviteSummary = v.object({ id: v.id("businessInvites"), teamId: v.id("businessTeams"), email: v.optional(v.string()), role: inviteRole, expiresAt: v.number() });
const invitationsArgs = { teamId: v.id("businessTeams") };
export async function invitationsForActor(ctx: QueryCtx, actorId: string | undefined, args: ObjectType<typeof invitationsArgs>) {
  await memberAccess(ctx, actorId, args.teamId, true);
  return (await ctx.db.query("businessInvites").withIndex("by_team", q => q.eq("teamId", args.teamId)).take(100)).map(row => ({ id: row._id, teamId: row.teamId, email: row.email, role: row.role, expiresAt: row.expiresAt }));
}
export const invitations = query({ args: invitationsArgs, returns: v.array(inviteSummary), handler: (ctx, args) => invitationsForActor(ctx, undefined, args) });
const inboxArgs = {};
export async function inboxForActor(ctx: QueryCtx, actorId: string | undefined, args: ObjectType<typeof inboxArgs>) {
  const { identity } = await actorOf(ctx, actorId), email = verifiedEmail(identity);
  if (!email) return [];
  const result = [];
  for (const row of await ctx.db.query("businessInvites").withIndex("by_email", q => q.eq("email", email)).take(100)) {
    if (row.expiresAt <= Date.now()) continue;
    const team = await ctx.db.get("businessTeams", row.teamId);
    if (team) result.push({ invite: { id: row._id, teamId: row.teamId, email: row.email, role: row.role, expiresAt: row.expiresAt }, teamName: team.name });
  }
  return result;
}
export const inbox = query({ args: inboxArgs, returns: v.array(v.object({ invite: inviteSummary, teamName: v.string() })), handler: (ctx, args) => inboxForActor(ctx, undefined, args) });
const acceptArgs = { token: v.optional(v.string()), inviteId: v.optional(v.id("businessInvites")) };
export async function acceptForActor(ctx: MutationCtx, actorId: string | undefined, args: ObjectType<typeof acceptArgs>) {
  const { identity, user } = await actorOf(ctx, actorId);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Finish signing in first.");
  await consumeRate(ctx, `business:accept:${identity.subject}`, 30, 3_600_000);
  if (!!args.token === !!args.inviteId || (args.token && !/^[a-f0-9]{64}$/.test(args.token))) throw new Error("Invalid invitation.");
  const digest = args.token ? await sha256Hex(args.token) : undefined;
  const actual = digest ? await ctx.db.query("businessInvites").withIndex("by_hash", q => q.eq("tokenHash", digest)).unique() : args.inviteId ? await ctx.db.get("businessInvites", args.inviteId) : null;
  if (!actual || actual.expiresAt <= Date.now() || !(await ctx.db.get("businessTeams", actual.teamId))) throw new Error("Invitation expired, revoked or already used.");
  if (actual.email && verifiedEmail(identity) !== actual.email) throw new Error("Verify the invited email address before joining.");
  if (!args.token && !actual.email) throw new Error("Use the invitation link to join.");
  if (await creatorRestricted(ctx, actual.invitedBy)) throw new Error("The inviting account is restricted.");
  const inviter = await businessMember(ctx, actual.teamId, actual.invitedBy);
  if (!inviter || inviter.role === "member" || (actual.role === "admin" && inviter.role !== "owner")) throw new Error("The inviter no longer has permission to invite this role.");
  await join(ctx, actual.teamId, identity.subject, actual.role);
  await ctx.db.delete("businessInvites", actual._id); return actual.teamId;
}
export const accept = mutation({ args: acceptArgs, returns: v.id("businessTeams"), handler: (ctx, args) => acceptForActor(ctx, undefined, args) });
const revokeInviteArgs = { inviteId: v.id("businessInvites") };
export async function revokeInviteForActor(ctx: MutationCtx, actorId: string | undefined, args: ObjectType<typeof revokeInviteArgs>) {
  const row = await ctx.db.get("businessInvites", args.inviteId); if (!row) return null;
  const { identity } = await memberAccess(ctx, actorId, row.teamId, true);
  await ctx.db.delete("businessInvites", row._id);
  await record(ctx, row.teamId, identity.subject, "invite_revoked", row.email ?? "Single-use link"); return null;
}
export const revokeInvite = mutation({ args: revokeInviteArgs, returns: v.null(), handler: (ctx, args) => revokeInviteForActor(ctx, undefined, args) });
async function assetDetails(ctx: Ctx, asset: Infer<typeof teamAsset>) {
  if (asset.kind === "form") { const row = await ctx.db.get("forms", asset.id); return row && !row.isBanned ? { title: row.title, ownerId: row.ownerId, href: `/dashboard/forms/${row._id}` } : null; }
  if (asset.kind === "lesson") { const row = await ctx.db.get("lessons", asset.id); return row && row.status === "active" && row.communityState !== "removed" ? { title: row.metadata.title, ownerId: row.ownerId, href: `/dashboard/learn/lessons/${row._id}` } : null; }
  if (asset.kind === "course") { const row = await ctx.db.get("learnCollections", asset.id); return row && !row.archived && row.communityState !== "removed" ? { title: row.metadata.title, ownerId: row.ownerId, href: `/dashboard/courses/${row._id}` } : null; }
  const row = await ctx.db.get("folders", asset.id); return row ? { title: row.name, ownerId: row.ownerId, href: "" } : null;
}
const shareArgs = { teamId: v.id("businessTeams"), asset: teamAsset };
export async function shareForActor(ctx: MutationCtx, actorId: string | undefined, args: ObjectType<typeof shareArgs>) {
  const { identity } = await memberAccess(ctx, actorId, args.teamId);
  const details = await assetDetails(ctx, args.asset);
  if (!details || details.ownerId !== identity.subject) throw new Error("Only the resource owner can share it with a team.");
  const existing = await ctx.db.query("businessShares").withIndex("by_team_asset", q => q.eq("teamId", args.teamId).eq("asset", args.asset)).unique();
  if (existing) return null;
  if ((await ctx.db.query("businessShares").withIndex("by_team_asset", q => q.eq("teamId", args.teamId)).take(101)).length >= 100) throw new Error("A team supports up to 100 shared resources.");
  if ((await ctx.db.query("businessShares").withIndex("by_asset", q => q.eq("asset", args.asset)).take(21)).length >= 20) throw new Error("A resource can be shared with up to 20 teams.");
  await ctx.db.insert("businessShares", { ...args, ownerId: identity.subject, sharedBy: identity.subject, createdAt: Date.now() });
  await record(ctx, args.teamId, identity.subject, "resource_shared", `${args.asset.kind}: ${details.title}`); return null;
}
export const share = mutation({ args: shareArgs, returns: v.null(), handler: (ctx, args) => shareForActor(ctx, undefined, args) });
const unshareArgs = { shareId: v.id("businessShares") };
export async function unshareForActor(ctx: MutationCtx, actorId: string | undefined, args: ObjectType<typeof unshareArgs>) {
  const share = await ctx.db.get("businessShares", args.shareId); if (!share) return null;
  const { identity, member } = await memberAccess(ctx, actorId, share.teamId);
  if (share.ownerId !== identity.subject && member.role === "member") throw new Error("Only the resource owner or a team administrator can stop sharing.");
  await ctx.db.delete("businessShares", share._id);
  await record(ctx, share.teamId, identity.subject, "resource_unshared", `${share.asset.kind}: ${share.asset.id}`); return null;
}
export const unshare = mutation({ args: unshareArgs, returns: v.null(), handler: (ctx, args) => unshareForActor(ctx, undefined, args) });
const resource = v.object({ asset: teamAsset, title: v.string(), ownerId: v.string(), href: v.string() });
const resourcesArgs = { teamId: v.id("businessTeams") };
export async function resourcesForActor(ctx: QueryCtx, actorId: string | undefined, args: ObjectType<typeof resourcesArgs>) {
  await memberAccess(ctx, actorId, args.teamId);
  const result = [];
  for (const row of await ctx.db.query("businessShares").withIndex("by_team_asset", q => q.eq("teamId", args.teamId)).take(100)) {
    const details = await assetDetails(ctx, row.asset);
    if (details && !await creatorRestricted(ctx, details.ownerId)) result.push({ shareId: row._id, asset: row.asset, ...details });
  }
  return result;
}
export const resources = query({ args: resourcesArgs, returns: v.array(v.object({ shareId: v.id("businessShares"), asset: teamAsset, title: v.string(), ownerId: v.string(), href: v.string() })), handler: (ctx, args) => resourcesForActor(ctx, undefined, args) });
const ownedResourcesArgs = {};
export async function ownedResourcesForActor(ctx: QueryCtx, actorId: string | undefined, args: ObjectType<typeof ownedResourcesArgs>) {
  const { identity } = await actorOf(ctx, actorId), ownerId = identity.subject;
  const [forms, lessons, courses, folders] = await Promise.all([
    ctx.db.query("forms").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", ownerId)).order("desc").take(200),
    ctx.db.query("lessons").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", ownerId)).order("desc").take(200),
    ctx.db.query("learnCollections").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", ownerId)).order("desc").take(200),
    ctx.db.query("folders").withIndex("by_ownerId_and_parentId", q => q.eq("ownerId", ownerId)).take(200),
  ]);
  return [
    ...forms.filter(row => !row.isBanned).map(row => ({ asset: { kind: "form" as const, id: row._id }, title: row.title, ownerId, href: `/dashboard/forms/${row._id}` })),
    ...lessons.filter(row => row.status === "active" && row.communityState !== "removed").map(row => ({ asset: { kind: "lesson" as const, id: row._id }, title: row.metadata.title, ownerId, href: `/dashboard/learn/lessons/${row._id}` })),
    ...courses.filter(row => !row.archived && row.communityState !== "removed").map(row => ({ asset: { kind: "course" as const, id: row._id }, title: row.metadata.title, ownerId, href: `/dashboard/courses/${row._id}` })),
    ...folders.map(row => ({ asset: { kind: "folder" as const, id: row._id }, title: row.name, ownerId, href: "" })),
  ];
}
export const ownedResources = query({ args: ownedResourcesArgs, returns: v.array(resource), handler: (ctx, args) => ownedResourcesForActor(ctx, undefined, args) });
const activityArgs = { teamId: v.id("businessTeams") };
export async function activityForActor(ctx: QueryCtx, actorId: string | undefined, args: ObjectType<typeof activityArgs>) {
  await memberAccess(ctx, actorId, args.teamId);
  return ctx.db.query("businessActivity").withIndex("by_team", q => q.eq("teamId", args.teamId)).order("desc").take(50);
}
export const activity = query({ args: activityArgs, returns: v.array(schema.doc("businessActivity")), handler: (ctx, args) => activityForActor(ctx, undefined, args) });
const folderArgs = { folderId: v.id("folders") };
export async function folderForActor(ctx: QueryCtx, actorId: string | undefined, args: ObjectType<typeof folderArgs>) {
  const { identity } = await actorOf(ctx, actorId); return owned(ctx, args.folderId, identity.subject);
}
export const folder = query({ args: folderArgs, returns: schema.doc("folders"), handler: (ctx, args) => folderForActor(ctx, undefined, args) });
const folderResourcesArgs = { folderId: v.id("folders"), paginationOpts: paginationOptsValidator };
export async function folderResourcesForActor(ctx: QueryCtx, actorId: string | undefined, args: ObjectType<typeof folderResourcesArgs>) {
  const { identity } = await actorOf(ctx, actorId);
  if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 48) throw new Error("Invalid page size.");
  const page = await listMembersFolderForActor(ctx, identity.subject, args);
  const result = [];
  for (const member of page.page) {
    const asset = member.asset.kind === "collection" ? { kind: "course" as const, id: member.asset.id } : member.asset;
    if (asset.kind !== "form" && asset.kind !== "lesson" && asset.kind !== "course") continue;
    const details = await assetDetails(ctx, asset);
    if (details && !await creatorRestricted(ctx, details.ownerId)) result.push({ memberId: member._id, asset, ...details });
  }
  return { ...page, page: result };
}
export const folderResources = query({ args: folderResourcesArgs, returns: paginationResultValidator(v.object({ memberId: v.id("folderMembers"), asset: teamAsset, title: v.string(), ownerId: v.string(), href: v.string() })), handler: (ctx, args) => folderResourcesForActor(ctx, undefined, args) });
