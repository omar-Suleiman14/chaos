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
  const kind = z.enum(["institution", "program", "module", "creator", "tag"]);
  server.registerTool("search_learn_directory", {
    description: "Search public Learn institutions, programs, modules/subjects, creators or tags. Creator matching defaults to username prefix; choose name for indexed display-name matching. Results never include private lessons or evidence. Continue through empty pages until isDone; deduplicate tags across pages.",
    inputSchema: { kind, text: z.string().trim().min(1).max(200), creatorMatch: z.enum(["username", "name"]).optional(), institutionId: z.string().min(1).max(100).optional(), versionId: z.string().min(1).max(100).optional(), paginationOpts: z.object({ numItems: z.number().int().min(1).max(25), cursor: z.string().max(4096).nullable() }).strict() },
    outputSchema: { page: z.array(z.object({ kind, id: z.string(), name: z.string(), parentId: z.string().nullable() })).max(500), isDone: z.boolean(), continueCursor: z.string(), splitCursor: z.string().nullable().optional(), pageStatus: z.enum(["SplitRecommended", "SplitRequired"]).nullable().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, _meta: { securitySchemes },
  }, (input: Record<string, unknown>) => run("search_learn_directory", input, data => `Found ${Array.isArray(data.page) ? data.page.length : 0} public directory matches.`));
}
