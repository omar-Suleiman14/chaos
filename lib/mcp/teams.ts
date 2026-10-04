import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const ref = z.string().min(1).max(100);
const teamId = ref.describe("A Business team ID from list_teams.");
const role = z.enum(["owner", "admin", "member"]);
const inviteRole = z.enum(["admin", "member"]);
const asset = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("form"), id: ref }),
  z.object({ kind: z.literal("lesson"), id: ref }),
  z.object({ kind: z.literal("course"), id: ref }),
  z.object({ kind: z.literal("folder"), id: ref }),
]);
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

/**
 * Business teams: Personal is one user; teams share editing of forms, lessons, courses and folders.
 * Team-only (internal) publishing lives on the publish tools (visibility restricted + teamId),
 * set_form_response_controls (audienceTeamId) and host_game (teamId).
 */
export function registerTeamTools(
  server: McpServer,
  run: (tool: string, input: Record<string, unknown>, summarize: (data: Record<string, unknown>) => string) => Promise<CallToolResult>,
  securitySchemes: { type: string; scopes: string[] }[],
) {
  const meta = { securitySchemes };
  server.registerTool("list_teams", {
    description: "List the Business teams this person belongs to, with their role. Personal accounts have none; Business is free for a limited time (normally 50 EGP per active seat per month).",
    inputSchema: {}, outputSchema: { teams: z.array(z.object({ teamId: ref, name: z.string(), role })) }, annotations: read, _meta: meta,
  }, input => run("list_teams", input, d => `${(d.teams as unknown[] | undefined)?.length ?? 0} teams.`));
  server.registerTool("create_team", {
    description: "Create a Business team owned by this person. Free during the limited-time promotion; no checkout or charges. Each call creates a team, so check list_teams before retrying an uncertain success.",
    inputSchema: { name: z.string().trim().min(1).max(120) }, outputSchema: { teamId: ref }, annotations: write, _meta: meta,
  }, input => run("create_team", input, () => "Team created."));
  server.registerTool("rename_team", {
    description: "Rename a team. Owner or admin only.",
    inputSchema: { teamId, name: z.string().trim().min(1).max(120) }, outputSchema: { ok: z.boolean() }, annotations: { ...write, idempotentHint: true }, _meta: meta,
  }, input => run("rename_team", input, () => "Team renamed."));
  server.registerTool("list_team_members", {
    description: "List a team's members with names and roles. Member email addresses are not returned. Members only.",
    inputSchema: { teamId }, outputSchema: { members: z.array(z.object({ userId: ref, name: z.string(), role, joinedAt: z.number() })) }, annotations: read, _meta: meta,
  }, input => run("list_team_members", input, () => "Members loaded."));
  server.registerTool("invite_team_member", {
    description: "Create a single-use invitation that expires in seven days. Owner or admin only; only the owner can invite admins. With email, the invitation is bound to that verified address and appears in their Chaos account; without email it works for whoever opens the link. Returns the link to share; Chaos sends no email. Only on explicit request.",
    inputSchema: { teamId, email: z.string().email().max(254).optional(), role: inviteRole }, outputSchema: { inviteId: ref, link: z.string(), expiresAt: z.number() }, annotations: { ...write, openWorldHint: true }, _meta: meta,
  }, input => run("invite_team_member", input, d => `Invitation ready: ${d.link}`));
  server.registerTool("list_team_invitations", {
    description: "List open invitations for a team. Owner or admin only. Never returns invitation links.",
    inputSchema: { teamId }, outputSchema: { invitations: z.array(z.object({ id: ref, teamId: ref, email: z.string().optional(), role: inviteRole, expiresAt: z.number() })) }, annotations: read, _meta: meta,
  }, input => run("list_team_invitations", input, () => "Invitations loaded."));
  server.registerTool("revoke_team_invitation", {
    description: "Revoke an unused invitation. Owner or admin only.",
    inputSchema: { inviteId: ref }, outputSchema: { ok: z.boolean() }, annotations: { ...write, destructiveHint: true, idempotentHint: true }, _meta: meta,
  }, input => run("revoke_team_invitation", input, () => "Invitation revoked."));
  server.registerTool("accept_team_invitation", {
    description: "Join a team with an invitation link (or its token) the person was given. Email-bound invitations must be accepted in the Chaos app with the verified address. Only when the person asks to join.",
    inputSchema: { token: z.string().min(16).max(2000) }, outputSchema: { teamId: ref }, annotations: write, _meta: meta,
  }, input => run("accept_team_invitation", input, () => "Joined the team."));
  server.registerTool("change_team_member_role", {
    description: "Change a member's role. Only the owner assigns admins; role owner transfers ownership and makes the current owner an admin. Only on explicit request.",
    inputSchema: { teamId, memberId: ref.describe("userId from list_team_members"), role }, outputSchema: { ok: z.boolean() }, annotations: { ...write, destructiveHint: true }, _meta: meta,
  }, input => run("change_team_member_role", input, () => "Role changed."));
  server.registerTool("remove_team_member", {
    description: "Remove a member (or leave, with your own userId). Their shares to the team stop. The owner must transfer ownership before leaving. Only on explicit request.",
    inputSchema: { teamId, memberId: ref.describe("userId from list_team_members") }, outputSchema: { ok: z.boolean() }, annotations: { ...write, destructiveHint: true, idempotentHint: true }, _meta: meta,
  }, input => run("remove_team_member", input, () => "Member removed."));
  server.registerTool("list_team_resources", {
    description: "List forms, lessons, courses and folders shared with a team. Every member can edit shared content; publishing stays with each owner.",
    inputSchema: { teamId }, outputSchema: { resources: z.array(z.object({ shareId: ref, asset, title: z.string(), ownerId: ref, href: z.string() })) }, annotations: read, _meta: meta,
  }, input => run("list_team_resources", input, () => "Team resources loaded."));
  server.registerTool("share_with_team", {
    description: "Share an owned form, lesson, course or folder with a team so every member can edit it. Courses include their lessons; folders include their contents. Does not publish anything or change who can read published content.",
    inputSchema: { teamId, asset }, outputSchema: { ok: z.boolean() }, annotations: { ...write, idempotentHint: true }, _meta: meta,
  }, input => run("share_with_team", input, () => "Shared with the team."));
  server.registerTool("unshare_from_team", {
    description: "Stop sharing a resource with a team. The resource owner or a team admin only.",
    inputSchema: { shareId: ref }, outputSchema: { ok: z.boolean() }, annotations: { ...write, destructiveHint: true, idempotentHint: true }, _meta: meta,
  }, input => run("unshare_from_team", input, () => "Sharing stopped."));
}
