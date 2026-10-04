import { v, type Infer } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { requireActiveUser, verifiedIdentityEmail, creatorRestricted } from "./authz";
import { businessMember } from "./businessAccess";
import { inviteRole, teamAsset, teamRole } from "./businessModel";
import { consumeRate, randomHex, sha256Hex } from "./serverUtils";
import { planCatalog } from "../lib/planCatalog";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { owned, listMembersFolderForActor } from "./folderServices";

type Ctx = QueryCtx | MutationCtx;
async function memberAccess(ctx: Ctx, teamId: Id<"businessTeams">, manage = false) {
  const { identity, user } = await requireActiveUser(ctx);
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
export const list = query({ args: {}, returns: v.array(v.object({ team: schema.doc("businessTeams"), role: teamRole })), handler: async ctx => {
  const { identity } = await requireActiveUser(ctx);
  const memberships = await ctx.db.query("businessMembers").withIndex("by_user", q => q.eq("userId", identity.subject)).take(20);
  const result = [];
  for (const member of memberships) {
    const team = await ctx.db.get("businessTeams", member.teamId);
    if (team) result.push({ team, role: member.role });
  }
  return result;
} });
export const create = mutation({ args: { name: v.string() }, returns: v.id("businessTeams"), handler: async (ctx, args) => {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Finish signing in first.");
  if (!planCatalog.pro.promotion.active) throw new Error("Business team registration is currently closed.");
  await consumeRate(ctx, `business:create:${identity.subject}`, 5, 3_600_000);
  if ((await ctx.db.query("businessMembers").withIndex("by_user", q => q.eq("userId", identity.subject)).take(21)).length >= 20) throw new Error("TEAM_LIMIT: An account supports up to 20 teams.");
  const teamId = await ctx.db.insert("businessTeams", { name: nameValue(args.name), ownerId: identity.subject, createdAt: Date.now() });
  await ctx.db.insert("businessMembers", { teamId, userId: identity.subject, role: "owner", joinedAt: Date.now() });
  await record(ctx, teamId, identity.subject, "created", args.name.trim());
  return teamId;
} });
export const rename = mutation({ args: { teamId: v.id("businessTeams"), name: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const { identity } = await memberAccess(ctx, args.teamId, true);
  await ctx.db.patch("businessTeams", args.teamId, { name: nameValue(args.name) });
  await record(ctx, args.teamId, identity.subject, "renamed", args.name.trim()); return null;
} });
export const members = query({ args: { teamId: v.id("businessTeams") }, returns: v.array(v.object({ id: v.id("businessMembers"), userId: v.string(), name: v.string(), email: v.string(), role: teamRole, joinedAt: v.number() })), handler: async (ctx, args) => {
  await memberAccess(ctx, args.teamId);
  const rows = await ctx.db.query("businessMembers").withIndex("by_team_user", q => q.eq("teamId", args.teamId)).take(100);
  return Promise.all(rows.map(async row => { const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", row.userId)).first(); return { id: row._id, userId: row.userId, role: row.role, name: user?.name ?? "Former account", email: user?.email ?? "", joinedAt: row.joinedAt }; }));
} });
export const changeRole = mutation({ args: { teamId: v.id("businessTeams"), userId: v.string(), role: teamRole }, returns: v.null(), handler: async (ctx, args) => {
  const { identity, member, team } = await memberAccess(ctx, args.teamId, true);
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
} });
export const removeMember = mutation({ args: { teamId: v.id("businessTeams"), userId: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const { identity, member } = await memberAccess(ctx, args.teamId);
  const target = await businessMember(ctx, args.teamId, args.userId);
  if (!target) return null;
  if (target.role === "owner") throw new Error("The owner must transfer ownership before leaving.");
  if (identity.subject !== args.userId && (member.role === "member" || (member.role === "admin" && target.role === "admin"))) throw new Error("You cannot remove this member.");
  await ctx.db.delete("businessMembers", target._id);
  for (const share of await ctx.db.query("businessShares").withIndex("by_team_asset", q => q.eq("teamId", args.teamId)).take(100)) {
    if (share.ownerId === target.userId) await ctx.db.delete("businessShares", share._id);
  }
  await record(ctx, args.teamId, identity.subject, "member_removed", args.userId); return null;
} });
export const invite = mutation({ args: { teamId: v.id("businessTeams"), email: v.optional(v.string()), role: inviteRole }, returns: v.object({ inviteId: v.id("businessInvites"), token: v.string(), expiresAt: v.number() }), handler: async (ctx, args) => {
  const { identity, member } = await memberAccess(ctx, args.teamId, true);
  if (args.role === "admin" && member.role !== "owner") throw new Error("Only the owner can invite an administrator.");
  const email = args.email?.trim().toLowerCase() || undefined;
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new Error("Enter a valid email address.");
  await consumeRate(ctx, `business:invite:${identity.subject}`, 30, 3_600_000);
  if ((await ctx.db.query("businessInvites").withIndex("by_team", q => q.eq("teamId", args.teamId)).take(101)).length >= 100) throw new Error("Revoke unused invitations before creating more.");
  const token = randomHex(32), expiresAt = Date.now() + 7 * 86_400_000;
  const inviteId = await ctx.db.insert("businessInvites", { teamId: args.teamId, email, tokenHash: await sha256Hex(token), role: args.role, invitedBy: identity.subject, expiresAt, createdAt: Date.now() });
  await record(ctx, args.teamId, identity.subject, "invited", `${email ?? "Single-use link"}: ${args.role}`);
  return { inviteId, token, expiresAt };
} });
const inviteSummary = v.object({ id: v.id("businessInvites"), teamId: v.id("businessTeams"), email: v.optional(v.string()), role: inviteRole, expiresAt: v.number() });
export const invitations = query({ args: { teamId: v.id("businessTeams") }, returns: v.array(inviteSummary), handler: async (ctx, args) => {
  await memberAccess(ctx, args.teamId, true);
  return (await ctx.db.query("businessInvites").withIndex("by_team", q => q.eq("teamId", args.teamId)).take(100)).map(row => ({ id: row._id, teamId: row.teamId, email: row.email, role: row.role, expiresAt: row.expiresAt }));
} });
export const inbox = query({ args: {}, returns: v.array(v.object({ invite: inviteSummary, teamName: v.string() })), handler: async ctx => {
  const { identity } = await requireActiveUser(ctx), email = verifiedIdentityEmail(identity);
  if (!email) return [];
  const result = [];
  for (const row of await ctx.db.query("businessInvites").withIndex("by_email", q => q.eq("email", email)).take(100)) {
    if (row.expiresAt <= Date.now()) continue;
    const team = await ctx.db.get("businessTeams", row.teamId);
    if (team) result.push({ invite: { id: row._id, teamId: row.teamId, email: row.email, role: row.role, expiresAt: row.expiresAt }, teamName: team.name });
  }
  return result;
} });
export const accept = mutation({ args: { token: v.optional(v.string()), inviteId: v.optional(v.id("businessInvites")) }, returns: v.id("businessTeams"), handler: async (ctx, args) => {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Finish signing in first.");
  await consumeRate(ctx, `business:accept:${identity.subject}`, 30, 3_600_000);
  if (!!args.token === !!args.inviteId || (args.token && !/^[a-f0-9]{64}$/.test(args.token))) throw new Error("Invalid invitation.");
  const digest = args.token ? await sha256Hex(args.token) : undefined;
  const actual = digest ? await ctx.db.query("businessInvites").withIndex("by_hash", q => q.eq("tokenHash", digest)).unique() : args.inviteId ? await ctx.db.get("businessInvites", args.inviteId) : null;
  if (!actual || actual.expiresAt <= Date.now() || !(await ctx.db.get("businessTeams", actual.teamId))) throw new Error("Invitation expired, revoked or already used.");
  if (actual.email && verifiedIdentityEmail(identity) !== actual.email) throw new Error("Verify the invited email address before joining.");
  if (!args.token && !actual.email) throw new Error("Use the invitation link to join.");
  if (await creatorRestricted(ctx, actual.invitedBy)) throw new Error("The inviting account is restricted.");
  const inviter = await businessMember(ctx, actual.teamId, actual.invitedBy);
  if (!inviter || inviter.role === "member" || (actual.role === "admin" && inviter.role !== "owner")) throw new Error("The inviter no longer has permission to invite this role.");
  await join(ctx, actual.teamId, identity.subject, actual.role);
  await ctx.db.delete("businessInvites", actual._id); return actual.teamId;
} });
export const revokeInvite = mutation({ args: { inviteId: v.id("businessInvites") }, returns: v.null(), handler: async (ctx, args) => {
  const row = await ctx.db.get("businessInvites", args.inviteId); if (!row) return null;
  const { identity } = await memberAccess(ctx, row.teamId, true);
  await ctx.db.delete("businessInvites", row._id);
  await record(ctx, row.teamId, identity.subject, "invite_revoked", row.email ?? "Single-use link"); return null;
} });
async function assetDetails(ctx: Ctx, asset: Infer<typeof teamAsset>) {
  if (asset.kind === "form") { const row = await ctx.db.get("forms", asset.id); return row && !row.isBanned ? { title: row.title, ownerId: row.ownerId, href: `/dashboard/forms/${row._id}` } : null; }
  if (asset.kind === "lesson") { const row = await ctx.db.get("lessons", asset.id); return row && row.status === "active" && row.communityState !== "removed" ? { title: row.metadata.title, ownerId: row.ownerId, href: `/dashboard/learn/lessons/${row._id}` } : null; }
  if (asset.kind === "course") { const row = await ctx.db.get("learnCollections", asset.id); return row && !row.archived && row.communityState !== "removed" ? { title: row.metadata.title, ownerId: row.ownerId, href: `/dashboard/courses/${row._id}` } : null; }
  const row = await ctx.db.get("folders", asset.id); return row ? { title: row.name, ownerId: row.ownerId, href: "" } : null;
}
export const share = mutation({ args: { teamId: v.id("businessTeams"), asset: teamAsset }, returns: v.null(), handler: async (ctx, args) => {
  const { identity } = await memberAccess(ctx, args.teamId);
  const details = await assetDetails(ctx, args.asset);
  if (!details || details.ownerId !== identity.subject) throw new Error("Only the resource owner can share it with a team.");
  const existing = await ctx.db.query("businessShares").withIndex("by_team_asset", q => q.eq("teamId", args.teamId).eq("asset", args.asset)).unique();
  if (existing) return null;
  if ((await ctx.db.query("businessShares").withIndex("by_team_asset", q => q.eq("teamId", args.teamId)).take(101)).length >= 100) throw new Error("A team supports up to 100 shared resources.");
  if ((await ctx.db.query("businessShares").withIndex("by_asset", q => q.eq("asset", args.asset)).take(21)).length >= 20) throw new Error("A resource can be shared with up to 20 teams.");
  await ctx.db.insert("businessShares", { ...args, ownerId: identity.subject, sharedBy: identity.subject, createdAt: Date.now() });
  await record(ctx, args.teamId, identity.subject, "resource_shared", `${args.asset.kind}: ${details.title}`); return null;
} });
export const unshare = mutation({ args: { shareId: v.id("businessShares") }, returns: v.null(), handler: async (ctx, args) => {
  const share = await ctx.db.get("businessShares", args.shareId); if (!share) return null;
  const { identity, member } = await memberAccess(ctx, share.teamId);
  if (share.ownerId !== identity.subject && member.role === "member") throw new Error("Only the resource owner or a team administrator can stop sharing.");
  await ctx.db.delete("businessShares", share._id);
  await record(ctx, share.teamId, identity.subject, "resource_unshared", `${share.asset.kind}: ${share.asset.id}`); return null;
} });
const resource = v.object({ asset: teamAsset, title: v.string(), ownerId: v.string(), href: v.string() });
export const resources = query({ args: { teamId: v.id("businessTeams") }, returns: v.array(v.object({ shareId: v.id("businessShares"), asset: teamAsset, title: v.string(), ownerId: v.string(), href: v.string() })), handler: async (ctx, args) => {
  await memberAccess(ctx, args.teamId);
  const result = [];
  for (const row of await ctx.db.query("businessShares").withIndex("by_team_asset", q => q.eq("teamId", args.teamId)).take(100)) {
    const details = await assetDetails(ctx, row.asset);
    if (details && !await creatorRestricted(ctx, details.ownerId)) result.push({ shareId: row._id, asset: row.asset, ...details });
  }
  return result;
} });
export const ownedResources = query({ args: {}, returns: v.array(resource), handler: async ctx => {
  const { identity } = await requireActiveUser(ctx), ownerId = identity.subject;
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
} });
export const activity = query({ args: { teamId: v.id("businessTeams") }, returns: v.array(schema.doc("businessActivity")), handler: async (ctx, args) => {
  await memberAccess(ctx, args.teamId);
  return ctx.db.query("businessActivity").withIndex("by_team", q => q.eq("teamId", args.teamId)).order("desc").take(50);
} });
export const folder = query({ args: { folderId: v.id("folders") }, returns: schema.doc("folders"), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); return owned(ctx, args.folderId, identity.subject);
} });
export const folderResources = query({ args: { folderId: v.id("folders"), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(v.object({ memberId: v.id("folderMembers"), asset: teamAsset, title: v.string(), ownerId: v.string(), href: v.string() })), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx);
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
} });
