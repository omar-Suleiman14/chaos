import { vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer, McpToolError, type McpCaller } from "@/lib/mcp/server";
import type { T } from "./fixtures";

export const MCP_TEST_SECRET = "perf-mcp-secret-0123456789abcdef0123456789";

/**
 * The production MCP path without the network: the real MCP server
 * (lib/mcp/server.ts) talks to the real Convex HTTP action (/api/mcp/v1) of a
 * convex-test deployment, exactly as app/mcp/route.ts does after verifying
 * the OAuth token.
 */
export function convexMcpCaller(t: T, userId: string): McpCaller {
  vi.stubEnv("CHAOS_MCP_SECRET", MCP_TEST_SECRET);
  return async (tool, input) => {
    const response = await t.fetch("/api/mcp/v1", {
      method: "POST",
      headers: { Authorization: `Bearer ${MCP_TEST_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId, tool, input }),
    });
    const body = (await response.json().catch(() => null)) as { result?: unknown; error?: { code: string; message: string } } | null;
    if (response.ok && body && "result" in body) return body.result;
    throw new McpToolError(body?.error?.code ?? "ERROR", body?.error?.message ?? "Chaos could not complete this.");
  };
}

export async function connectMcp(call: McpCaller | null, admin = false) {
  const server = createChaosMcpServer({ call, admin, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
  const client = new Client({ name: "chaos-perf", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
