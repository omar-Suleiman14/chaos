import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

const secret = "mcp-consent-test-secret-0123456789abcdef";
const owner = creatorIdentity.subject;
const clientId = "oauth_client_chatgpt";
const otherClient = "oauth_client_claude";

afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const t = createTestConvex();
  await t.mutation(internal.mcp.begin, { userId: owner, profile: { name: "Owner", email: creatorIdentity.email, emailVerified: true } });
  const caller = t.withIdentity(creatorIdentity);
  await t.mutation(internal.mcpClientGrants.observeTransportClient, { userId: owner, clientId, label: "ChatGPT" });
  return { t, caller };
}

describe("MCP OAuth connection consent", () => {
  it("starts compatible, but allows the owner to narrow and restore one verified client", async () => {
    const { t, caller } = await setup();
    const initial = await caller.query(api.mcpClientGrants.listMine, {});
    expect(initial).toHaveLength(1);
    expect(initial[0].label).toBe("ChatGPT");
    expect(initial[0].permissions).toContain("edit_content");
    await caller.mutation(api.mcpClientGrants.updateMine, { clientId, permissions: ["read_content", "aggregate_analytics"] });
    await expect(t.query(internal.mcpClientGrants.checkTransportTool, { userId: owner, clientId, tool: "create_form" }))
      .rejects.toThrow(/PERMISSION_DENIED/);
    await expect(t.query(internal.mcpClientGrants.checkTransportTool, { userId: owner, clientId, tool: "get_form" }))
      .resolves.toBeNull();
    await caller.mutation(api.mcpClientGrants.updateMine, { clientId, permissions: ["read_content", "edit_content"] });
    await expect(t.query(internal.mcpClientGrants.checkTransportTool, { userId: owner, clientId, tool: "create_form" }))
      .resolves.toBeNull();
  });

  it("isolates permissions by OAuth client and signed-in owner", async () => {
    const { t, caller } = await setup();
    await t.mutation(internal.mcpClientGrants.observeTransportClient, { userId: owner, clientId: otherClient });
    await caller.mutation(api.mcpClientGrants.updateMine, { clientId, permissions: [] });
    await expect(t.query(internal.mcpClientGrants.checkTransportTool, { userId: owner, clientId, tool: "search_forms" }))
      .rejects.toThrow(/PERMISSION_DENIED/);
    await expect(t.query(internal.mcpClientGrants.checkTransportTool, { userId: owner, clientId: otherClient, tool: "search_forms" }))
      .resolves.toBeNull();
    await expect(t.withIdentity(otherCreatorIdentity).mutation(api.mcpClientGrants.updateMine, { clientId, permissions: ["read_content"] }))
      .rejects.toThrow();
  });

  it("never lets a non-admin grant admin-only categories or unknown operations", async () => {
    const { t, caller } = await setup();
    await expect(caller.mutation(api.mcpClientGrants.updateMine, { clientId, permissions: ["admin_operations"] }))
      .rejects.toThrow(/PERMISSION_DENIED/);
    await expect(t.query(internal.mcpClientGrants.checkTransportTool, { userId: owner, clientId, tool: "imaginary_tool" }))
      .rejects.toThrow();
    await expect(caller.mutation(api.mcpClientGrants.updateMine, { clientId, permissions: ["read_content", "read_content"] }))
      .rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("enforces a revoked permission at the backend HTTP boundary, not only tools/list", async () => {
    vi.stubEnv("CHAOS_MCP_SECRET", secret);
    // The HTTP transport intentionally validates production-format Clerk IDs.
    // The shared creatorIdentity fixture has underscores and is valid for Convex
    // identity tests but *not* for the HTTP envelope regex.
    const { t } = await setup();
    const httpActor = "user_consenthttp1";
    const auth = { ...creatorIdentity, subject: httpActor, tokenIdentifier: `${creatorIdentity.issuer}|${httpActor}` };
    await t.mutation(internal.mcp.begin, { userId: httpActor, profile: { name: "HTTP consent tester", email: "consent@example.com" } });
    await t.mutation(internal.mcpClientGrants.observeTransportClient, { userId: httpActor, clientId, label: "ChatGPT" });
    await t.withIdentity(auth).mutation(api.mcpClientGrants.updateMine, { clientId, permissions: ["read_content"] });
    const send = (tool: string, input: Record<string, unknown> = {}) => t.fetch("/api/mcp/v1", {
      method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: httpActor, clientId, tool, input }),
    });
    const denied = await send("create_form", { form: { title: "Forbidden", questions: [] } });
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe("PERMISSION_DENIED");
    const granted = await send("get_mcp_grants");
    expect(granted.status).toBe(200);
    expect((await granted.json()).result.permissions).toEqual(["read_content"]);
    const allowed = await send("search_forms");
    expect(allowed.status).toBe(200);
  });
});
