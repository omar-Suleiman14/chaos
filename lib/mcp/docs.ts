import { absoluteUrl } from "@/lib/hosts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("p"), text: z.string() }), z.object({ type: z.literal("tip"), text: z.string() }),
  z.object({ type: z.literal("heading"), id: z.string(), text: z.string() }),
  z.object({ type: z.literal("steps"), items: z.array(z.string()) }), z.object({ type: z.literal("list"), items: z.array(z.string()) }),
  z.object({ type: z.literal("keys"), items: z.array(z.object({ keys: z.array(z.string()), label: z.string() })) }),
]);
export function registerDocumentationTools(server: McpServer, run: (tool: string, input: Record<string, unknown>, summarize: (data: Record<string, unknown>) => string) => Promise<CallToolResult>, securitySchemes: { type: string; scopes: string[] }[]) {
  const _meta = { securitySchemes };
  server.registerTool("list_documentation", { title: "List documentation (admin)", description: "Chaos administrators only: read up to 200 draft and published guides for one language, including their current revision and blocks. Regular accounts cannot access documentation drafts or authoring.", inputSchema: { locale: z.enum(["en", "ar"]) }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }, _meta }, input => run("list_documentation", input, () => "Documentation loaded."));
  server.registerTool("save_documentation", { title: "Author documentation (admin)", description: "Chaos administrators only: create or update a guide. Publishes by default; set publish false when asked for a draft. When updating first read list_documentation, preserve blocks, and send expectedRevision. Slugs are lowercase hyphenated identifiers; heading ids must be unique lowercase anchors. Bold, code and links work in block text.", inputSchema: { slug: z.string().max(100), locale: z.enum(["en", "ar"]), sectionId: z.string().min(1).max(100), sectionTitle: z.string().max(200), order: z.number().int(), content: z.object({ title: z.string().min(1).max(200), summary: z.string().max(2000), blocks: z.array(block).max(500) }), expectedRevision: z.number().int().nonnegative().optional(), publish: z.boolean().optional() }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false }, _meta }, input => run("save_documentation", { ...input, publish: input.publish !== false }, data => data.published ? `Published guide: ${absoluteUrl(`/docs/${data.slug}`)}` : "Documentation draft saved."));
}
