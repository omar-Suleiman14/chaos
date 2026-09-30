import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export function registerCommunityTools(server: McpServer, run: (tool: string, input: Record<string, unknown>, summarize: (data: Record<string, unknown>) => string) => Promise<CallToolResult>, securitySchemes: { type: string; scopes: string[] }[]) {
  server.registerTool("save_lesson", {
    description: "Save a public lesson to your Chaos library. Repeating the operation is safe. Source file access is not granted. Set saved=false to withdraw a save, including after unpublication.",
    inputSchema: { lessonId: z.string().min(1).max(100), saved: z.boolean().default(true) },
    outputSchema: { saved: z.boolean() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes },
  }, (input: Record<string, unknown>) => run("save_lesson", input, data => data.saved ? "Lesson saved." : "Lesson save withdrawn."));
}
