/**
 * MCP user consent is separate from OAuth identity scopes.
 * The identity and clientId on the transport are verified by Next.js before being
 * forwarded with CHAOS_MCP_SECRET. Browser mutations use ctx.auth instead.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getAuthIdentity } from "./authIdentity";
import { requireActiveUser } from "./authz";
import { MCP_PERMISSIONS, permissionForTool, type McpPermission } from "../lib/mcp/permissions";

const DEFAULT_PERMISSIONS: McpPermission[] = ["read_content", "aggregate_analytics"];
const ADMIN_ONLY = new Set<McpPermission>(["admin_crm", "admin_operations"]);
const USER_PERMISSIONS = MCP_PERMISSIONS.filter(p => !ADMIN_ONLY.has(p));
const CLIENT_LIMIT = 100;

/** The OAuth client identifier is never read from tool arguments or headers from the assistant. */
function clientKey(clientId: string) {
  if (!clientId || clientId.length > 256 || !/^[\x21-\x7e]+$/.test(clientId))
    throw new Error("VALIDATION_FAILED: Invalid verified OAuth client ID.");
  return clientId;
}

function validPermissions(list: string[], admin: boolean): McpPermission[] {
  const allowed: readonly string[] = admin ? MCP_PERMISSIONS : USER_PERMISSIONS;
  if (list.length > MCP_PERMISSIONS.length || new Set(list).size !== list.length || list.some(p => !allowed.includes(p)))
    throw new Error("PERMISSION_DENIED: Invalid MCP permission selection.");
  return list as McpPermission[];
}

export const observeTransportClient = internalMutation({
  args: { userId: v.string(), clientId: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, { userId, clientId, label }) => {
    clientKey(clientId);
    const owner = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", userId)).unique();
    if (!owner || owner.isBanned || owner.suspendedUntil) throw new Error("ACCOUNT_RESTRICTED: Sign in with an active Chaos account.");
    const current = await ctx.db.query("mcpClientGrants").withIndex("by_owner_client", q => q.eq("ownerId", userId).eq("clientId", clientId)).unique();
    const now = Date.now();
    if (current) {
      // Avoid writing on each tool-list request: existing consent is never reset on reconnect.
      if (now - current.lastSeenAt > 6 * 3600_000) await ctx.db.patch(current._id, { lastSeenAt: now });
      return { permissions: validPermissions(current.permissions, true), label: current.label };
    }
    const existing = await ctx.db.query("mcpClientGrants").withIndex("by_owner", q => q.eq("ownerId", userId)).take(CLIENT_LIMIT + 1);
    if (existing.length >= CLIENT_LIMIT) throw new Error("LIMIT: Too many OAuth clients; revoke an old connection.");
    const name = (label ?? "").trim().slice(0, 80) || "OAuth client";
    await ctx.db.insert("mcpClientGrants", {
      ownerId: userId, clientId, label: name,
      permissions: DEFAULT_PERMISSIONS, createdAt: now, updatedAt: now, lastSeenAt: now,
    });
    return { permissions: DEFAULT_PERMISSIONS, label: name };
  },
});

/** Same backend access check for every tool execution, not a cache or MCP-list-only check. */
export const checkTransportTool = internalQuery({
  args: { userId: v.string(), clientId: v.string(), tool: v.string() },
  handler: async (ctx, { userId, clientId, tool }) => {
    clientKey(clientId);
    const category = permissionForTool(tool);
    const row = await ctx.db.query("mcpClientGrants").withIndex("by_owner_client", q => q.eq("ownerId", userId).eq("clientId", clientId)).unique();
    if (!row || !row.permissions.includes(category)) throw new Error("PERMISSION_DENIED: Enable this action for the connected app in Chaos → Connections.");
    if (ADMIN_ONLY.has(category)) {
      const admin = await ctx.db.query("admins").withIndex("by_clerkId", q => q.eq("clerkId", userId)).unique();
      if (!admin) throw new Error("PERMISSION_DENIED: Admin permission is not available.");
    }
    return null;
  },
});

/** Native, authenticated Connections UI. A client can never edit its own grants. */
export const listMine = query({
  args: {},
  handler: async ctx => {
    const { identity } = await requireActiveUser(ctx);
    const rows = await ctx.db.query("mcpClientGrants").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).take(CLIENT_LIMIT + 1);
    return rows.map(row => ({
      clientId: row.clientId, label: row.label, permissions: row.permissions,
      createdAt: row.createdAt, updatedAt: row.updatedAt, lastSeenAt: row.lastSeenAt,
    })).sort((a,b) => b.lastSeenAt - a.lastSeenAt);
  },
});

export const myCapabilities = query({
  args: {},
  handler: async ctx => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return { permissions: [] as string[] };
    const admin = await ctx.db.query("admins").withIndex("by_clerkId", q => q.eq("clerkId", identity.subject)).unique();
    return { permissions: admin ? [...MCP_PERMISSIONS] : [...USER_PERMISSIONS] };
  },
});

export const updateMine = mutation({
  args: { clientId: v.string(), permissions: v.array(v.string()) },
  handler: async (ctx, { clientId, permissions }) => {
    const { identity } = await requireActiveUser(ctx);
    clientKey(clientId);
    const row = await ctx.db.query("mcpClientGrants").withIndex("by_owner_client", q => q.eq("ownerId", identity.subject).eq("clientId", clientId)).unique();
    if (!row) throw new Error("NOT_FOUND: Connect the app once before changing its permissions.");
    const admin = await ctx.db.query("admins").withIndex("by_clerkId", q => q.eq("clerkId", identity.subject)).unique();
    const next = validPermissions(permissions, !!admin);
    await ctx.db.patch(row._id, { permissions: next, updatedAt: Date.now() });
    return { clientId, permissions: next };
  },
});
