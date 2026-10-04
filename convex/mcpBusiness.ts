// Trusted actor comes only from the secret-protected HTTP envelope (convex/http.ts).
import { v } from "convex/values";
import { env, internalMutation, internalQuery } from "./_generated/server";
import { requireLearnActor } from "./mcpLearn";
import { inviteRole, teamAsset, teamRole } from "./businessModel";
import {
  acceptForActor, changeRoleForActor, createForActor, invitationsForActor, inviteForActor, listForActor, membersForActor,
  removeMemberForActor, renameForActor, resourcesForActor, revokeInviteForActor, shareForActor, unshareForActor,
} from "./businessTeams";

const actor = { userId: v.string() };
const team = v.object({ teamId: v.id("businessTeams"), name: v.string(), role: teamRole });

export const listTeams = internalQuery({ args: actor, returns: v.object({ teams: v.array(team) }), handler: async (ctx, { userId }) =>
  ({ teams: (await listForActor(ctx, await requireLearnActor(ctx, userId), {})).map(row => ({ teamId: row.team._id, name: row.team.name, role: row.role })) }) });
export const createTeam = internalMutation({ args: { ...actor, name: v.string() }, returns: v.object({ teamId: v.id("businessTeams") }), handler: async (ctx, { userId, ...args }) =>
  ({ teamId: await createForActor(ctx, await requireLearnActor(ctx, userId), args) }) });
export const renameTeam = internalMutation({ args: { ...actor, teamId: v.id("businessTeams"), name: v.string() }, returns: v.object({ ok: v.boolean() }), handler: async (ctx, { userId, ...args }) => {
  await renameForActor(ctx, await requireLearnActor(ctx, userId), args); return { ok: true };
} });
export const listMembers = internalQuery({ args: { ...actor, teamId: v.id("businessTeams") }, returns: v.object({ members: v.array(v.object({ userId: v.string(), name: v.string(), role: teamRole, joinedAt: v.number() })) }), handler: async (ctx, { userId, ...args }) =>
  // Member email addresses stay in the app; assistants get names and roles only.
  ({ members: (await membersForActor(ctx, await requireLearnActor(ctx, userId), args)).map(({ userId, name, role, joinedAt }) => ({ userId, name, role, joinedAt })) }) });
export const inviteMember = internalMutation({ args: { ...actor, teamId: v.id("businessTeams"), email: v.optional(v.string()), role: inviteRole }, returns: v.object({ inviteId: v.id("businessInvites"), link: v.string(), expiresAt: v.number() }), handler: async (ctx, { userId, ...args }) => {
  const result = await inviteForActor(ctx, await requireLearnActor(ctx, userId), args);
  return { inviteId: result.inviteId, link: `${(env.CHAOS_APP_URL ?? "https://chaos.fail").replace(/\/+$/, "")}/dashboard/teams#invite=${result.token}`, expiresAt: result.expiresAt };
} });
export const listInvitations = internalQuery({ args: { ...actor, teamId: v.id("businessTeams") }, returns: v.object({ invitations: v.array(v.object({ id: v.id("businessInvites"), teamId: v.id("businessTeams"), email: v.optional(v.string()), role: inviteRole, expiresAt: v.number() })) }), handler: async (ctx, { userId, ...args }) =>
  ({ invitations: await invitationsForActor(ctx, await requireLearnActor(ctx, userId), args) }) });
export const revokeInvitation = internalMutation({ args: { ...actor, inviteId: v.id("businessInvites") }, returns: v.object({ ok: v.boolean() }), handler: async (ctx, { userId, ...args }) => {
  await revokeInviteForActor(ctx, await requireLearnActor(ctx, userId), args); return { ok: true };
} });
export const acceptInvitation = internalMutation({ args: { ...actor, token: v.string() }, returns: v.object({ teamId: v.id("businessTeams") }), handler: async (ctx, { userId, token }) => {
  // Links only: email invitations need a verified address, which MCP transports never carry.
  const invite = /#invite=([a-f0-9]{64})/.exec(token)?.[1] ?? token;
  return { teamId: await acceptForActor(ctx, await requireLearnActor(ctx, userId), { token: invite }) };
} });
export const changeMemberRole = internalMutation({ args: { ...actor, teamId: v.id("businessTeams"), memberId: v.string(), role: teamRole }, returns: v.object({ ok: v.boolean() }), handler: async (ctx, { userId, memberId, ...args }) => {
  await changeRoleForActor(ctx, await requireLearnActor(ctx, userId), { ...args, userId: memberId }); return { ok: true };
} });
export const removeMember = internalMutation({ args: { ...actor, teamId: v.id("businessTeams"), memberId: v.string() }, returns: v.object({ ok: v.boolean() }), handler: async (ctx, { userId, memberId, teamId }) => {
  await removeMemberForActor(ctx, await requireLearnActor(ctx, userId), { teamId, userId: memberId }); return { ok: true };
} });
export const listResources = internalQuery({ args: { ...actor, teamId: v.id("businessTeams") }, returns: v.object({ resources: v.array(v.object({ shareId: v.id("businessShares"), asset: teamAsset, title: v.string(), ownerId: v.string(), href: v.string() })) }), handler: async (ctx, { userId, ...args }) =>
  ({ resources: await resourcesForActor(ctx, await requireLearnActor(ctx, userId), args) }) });
export const share = internalMutation({ args: { ...actor, teamId: v.id("businessTeams"), asset: teamAsset }, returns: v.object({ ok: v.boolean() }), handler: async (ctx, { userId, ...args }) => {
  await shareForActor(ctx, await requireLearnActor(ctx, userId), args); return { ok: true };
} });
export const unshare = internalMutation({ args: { ...actor, shareId: v.id("businessShares") }, returns: v.object({ ok: v.boolean() }), handler: async (ctx, { userId, ...args }) => {
  await unshareForActor(ctx, await requireLearnActor(ctx, userId), args); return { ok: true };
} });
