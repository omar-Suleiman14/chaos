import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Chains existing tool calls for multi-step tools (see lib/mcp/server.ts). Every step is authorized on its own. */
export interface McpFlow {
  call: (tool: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  flow: (work: () => Promise<{ text: string; data: Record<string, unknown> }>) => Promise<CallToolResult>;
}
