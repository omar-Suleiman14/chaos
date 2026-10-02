import { expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";
import { api } from "@/convex/_generated/api";
import { createChaosMcpServer } from "@/lib/mcp/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
it("exposes a bounded read-only MCP schema and dispatches using the trusted actor", async () => {
  const server = createChaosMcpServer({ call: async () => ({ page: [], isDone: true, continueCursor: "" }), resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource" });
  const client = new Client({ name: "directory-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b);
  try {
    const tool = (await client.listTools()).tools.find(t => t.name === "search_learn_directory")!;
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(tool.inputSchema.properties).not.toHaveProperty("userId");
    expect((await client.callTool({ name: tool.name, arguments: { kind: "invalid", text: "University", paginationOpts: { numItems: 1, cursor: null } } })).isError).toBe(true);
  } finally { await client.close(); await server.close(); }
  const t = createTestConvex();
  await t.run(async ctx => {
    await ctx.db.insert("users", { clerkId: "user_directorytest", username: "creator", name: "Creator", email: "private@example.com", createdAt: 0, plan: "pro", planExpiresAt: Date.now() + 86400000 });
    await ctx.db.insert("curriculumInstitutions", { name: "University", key: "uni" });
  });
  const secret = "directory-mcp-secret-at-least-32-characters";
  vi.stubEnv("CHAOS_MCP_SECRET", secret);
  try {
    const response = await t.fetch("/api/mcp/v1", { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ userId: "user_directorytest", tool: "search_learn_directory", input: { kind: "institution", text: "University", paginationOpts: { numItems: 1, cursor: null } } }) });
    expect(response.status).toBe(200);
    expect((await response.json()).result.page[0].name).toBe("University");
    await t.run(async ctx => { const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", "user_directorytest")).unique(); await ctx.db.patch("users", user!._id, { isBanned: true }); });
    await expect(t.query(makeFunctionReference<"query">("learnCommunityIntegrations:directory"), { userId: "user_directorytest", kind: "institution", text: "University", paginationOpts: { numItems: 1, cursor: null } })).rejects.toThrow();
  } finally { vi.unstubAllEnvs(); }
});
it("requires community:read for API discovery and rejects unknown filters", async () => {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await t.run(ctx => ctx.db.insert("curriculumInstitutions", { name: "University", key: "uni" }));
  const connection = await owner.mutation(api.integrations.createConnection, { label: "Directory", access: "selected", itemRefs: [], scopes: ["community:read"] });
  const url = "/api/integrations/v2/community/directory?kind=institution&text=University&limit=1";
  expect((await t.fetch(url)).status).toBe(401);
  const headers = { Authorization: `Bearer ${connection.token}` };
  const response = await t.fetch(url, { headers });
  expect(response.status).toBe(200); expect((await response.json()).page[0].name).toBe("University");
  expect((await t.fetch(`${url}&userId=other`, { headers })).status).toBe(400);
  const noScope = await owner.mutation(api.integrations.createConnection, { label: "No directory", access: "selected", itemRefs: [], scopes: ["lessons:read"] });
  expect((await t.fetch(url, { headers: { Authorization: `Bearer ${noScope.token}` } })).status).toBe(403);
});
