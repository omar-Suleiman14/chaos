import { expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer } from "@/lib/mcp/server";
import { ADMIN_CRM_TOOLS, ADMIN_PLATFORM_TOOLS } from "@/lib/mcp/admin";
import { permissionForTool, type McpPermission } from "@/lib/mcp/permissions";

async function connect(admin: boolean, permissions?: McpPermission[]) {
  const call = vi.fn(async () => ({ ok: true, activity: [] }));
  const server = createChaosMcpServer({ call, admin, permissions, resourceMetadataUrl: "https://chaos.fail/mcp" });
  const client = new Client({ name: "admin-parity", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { call, server, client };
}

it("advertises admin UI parity tools only to verified admin connections with explicit permissions", async () => {
  for (const isAdmin of [false, true]) {
    const { server, client } = await connect(isAdmin);
    try {
      const { tools } = await client.listTools();
      for (const name of [...ADMIN_PLATFORM_TOOLS, ...ADMIN_CRM_TOOLS]) {
        const descriptor = tools.find(tool => tool.name === name);
        if (!isAdmin) { expect(descriptor).toBeUndefined(); continue; }
        expect(descriptor?.outputSchema, name).toBeDefined();
        expect(descriptor?.inputSchema.properties).not.toHaveProperty("userId");
        expect(descriptor?.inputSchema.properties).not.toHaveProperty("actorId");
        expect(descriptor?._meta?.["chaos/permission"]).toBe(permissionForTool(name));
        expect(descriptor?._meta?.securitySchemes).toEqual(expect.arrayContaining([expect.objectContaining({ type: "oauth2" })]));
      }
      for (const name of ["grant_admin", "revoke_admin", "bulk_plan", "all_users_plan"]) expect(tools.map(tool => tool.name)).not.toContain(name);
    } finally { await client.close(); await server.close(); }
  }
});

it("separates platform permissions from CRM and strips spoofed actors before dispatch", async () => {
  const { server, client, call } = await connect(true, ["admin_operations"]);
  try {
    const result = await client.callTool({ name: "moderate_admin_user", arguments: { accountId: "selected-account", state: "suspended", days: 2, reason: "Requested", userId: "spoof", actorId: "spoof" } });
    expect(result.isError).toBeFalsy();
    expect(call).toHaveBeenCalledWith("moderate_admin_user", { accountId: "selected-account", state: "suspended", days: 2, reason: "Requested" });
    call.mockClear();
    expect((await client.callTool({ name: "set_crm_contact_stages", arguments: { contactIds: ["contact"], stage: "active" } })).isError).toBe(true);
    expect(call).not.toHaveBeenCalled();
    for (const args of [{ days: 0, reason: "Reason" }, { days: 366, reason: "Reason" }, { days: 2, reason: " " }]) {
      expect((await client.callTool({ name: "moderate_admin_user", arguments: { accountId: "account", state: "suspended", ...args } })).isError).toBe(true);
    }
    expect(call).not.toHaveBeenCalled();
  } finally { await client.close(); await server.close(); }
  const crm = await connect(true, ["admin_crm"]);
  try {
    expect((await crm.client.callTool({ name: "list_admin_activity", arguments: {} })).isError).toBe(true);
    expect(crm.call).not.toHaveBeenCalled();
    expect((await crm.client.callTool({ name: "set_crm_contact_stages", arguments: { contactIds: ["contact"], stage: "active" } })).isError).toBeFalsy();
    expect(crm.call).toHaveBeenCalledOnce();
  } finally { await crm.client.close(); await crm.server.close(); }
});
