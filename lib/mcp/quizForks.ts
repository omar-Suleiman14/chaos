import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
const asset = z.discriminatedUnion("kind", [z.object({ kind: z.literal("form"), id: z.string().min(1) }), z.object({ kind: z.literal("quiz"), id: z.string().min(1) })]);
const version = z.discriminatedUnion("kind", [z.object({ kind: z.literal("form"), id: z.string() }), z.object({ kind: z.literal("quiz"), id: z.string() })]);
const lineage = z.object({ _id: z.string(), _creationTime: z.number(), asset, parent: asset, parentVersion: version, root: asset, rootVersion: version, parentCreatorId: z.string(), rootCreatorId: z.string(), ownerId: z.string(), depth: z.number(), createdAt: z.number() });
export function registerQuizForkTools(server: McpServer, run: (tool: string, input: Record<string, unknown>, summarize: (data: Record<string, unknown>) => string) => Promise<CallToolResult>, securitySchemes: { type: string; scopes: string[] }[]) {
  server.registerTool("fork_quiz", {
    description: "Create a private editable form/classic quiz fork from published content, preserving permanent parent and root version provenance. Select formVersionId for forms or expectedPublishedAt for classic quizzes. No responses, collaborators, operational settings or publication state are copied. Every successful call creates a new asset; inspect your library before retrying an uncertain success. Requires explicit intent to copy assessment content.",
    inputSchema: { asset, formVersionId: z.string().min(1).optional(), expectedPublishedAt: z.number().finite().optional() },
    outputSchema: { asset }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }, _meta: { securitySchemes },
  }, (input) => run("fork_quiz", input, () => "Private assessment fork created."));
  server.registerTool("get_quiz_fork_lineage", {
    description: "Inspect permanent parent/root version provenance of an owned assessment. Does not return answer keys or source content.",
    inputSchema: { asset }, outputSchema: { lineage: lineage.nullable() }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, _meta: { securitySchemes },
  }, (input) => run("get_quiz_fork_lineage", input, () => "Assessment provenance loaded."));
}
