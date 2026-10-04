import { expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer } from "@/lib/mcp/server";
import { permissionForTool } from "@/lib/mcp/permissions";

it("advertises public Card tools, hides CRM from members, and strips actor injection", async () => {
  const call = vi.fn(async () => ({ card: null }));
  const server = createChaosMcpServer({ call, resourceMetadataUrl: "https://chaos.fail/mcp" });
  const client = new Client({ name: "cards", version: "1" });
  const [a,b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a),client.connect(b)]);
  try {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);
    expect(names).toEqual(expect.arrayContaining(["list_public_authors", "get_public_card", "list_public_student_cards", "get_student_card_visibility", "set_author_listing_visibility"]));
    expect(names).not.toContain("list_crm_contacts");
    await client.callTool({ name: "get_public_card", arguments: { username: "teacher", userId: "injected" } });
    expect(call).toHaveBeenCalledWith("get_public_card", { username: "teacher" });
    call.mockClear();
    expect((await client.callTool({ name: "list_public_authors", arguments: { limit: 49 } })).isError).toBe(true);
    expect(call).not.toHaveBeenCalled();
  } finally { await client.close(); await server.close(); }
});

it("separates CRM permission from content reads and validates descriptors before dispatch", async () => {
  const call = vi.fn(async () => ({ contactId: "contact" }));
  const server = createChaosMcpServer({ call, admin: true, permissions: ["read_content"], resourceMetadataUrl: "https://chaos.fail/mcp" });
  const client = new Client({ name: "crm", version: "1" });
  const [a,b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a),client.connect(b)]);
  try {
    const { tools } = await client.listTools();
    for (const name of ["list_crm_contacts", "get_crm_contact", "save_crm_contact", "add_crm_note"]) {
      const tool = tools.find(t => t.name === name)!;
      expect(tool.outputSchema).toBeDefined();
      expect(tool.inputSchema.properties).not.toHaveProperty("userId");
      expect(tool._meta?.["chaos/permission"]).toBe("admin_crm");
      expect(permissionForTool(name)).toBe("admin_crm");
    }
    expect((await client.callTool({ name: "get_crm_contact", arguments: { contactId: "contact" } })).isError).toBe(true);
    expect(call).not.toHaveBeenCalled();
    expect((await client.callTool({ name: "add_crm_note", arguments: { contactId: "contact", body: " " } })).isError).toBe(true);
    expect(call).not.toHaveBeenCalled();
  } finally { await client.close(); await server.close(); }
});
