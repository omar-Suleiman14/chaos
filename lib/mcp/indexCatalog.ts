import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { INDEX_CATALOG_TYPES, INDEX_CATALOG_CHANNELS } from "@/convex/indexCatalogModel";

// Chaos Index catalogue tools (admin). The Index (index.chaos.fail) reads its lecture,
// tutorial, practical, CBL and exam posts from the live Convex catalogue; these tools let a
// signed-in administrator list it and publish verified Telegram posts through the same
// idempotent, validating upsert the scheduled updater uses. Authorization is enforced
// server-side in Convex (convex/mcpIndexCatalog.ts); the tool layer only describes and forwards.

export function registerIndexCatalogTools(server: McpServer,
  run: (tool: string, input: Record<string, unknown>, summarize: (data: Record<string, unknown>) => string) => Promise<CallToolResult>,
  securitySchemes: { type: string; scopes: string[] }[]) {
  const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };
  const write = { ...read, readOnlyHint: false };
  const _meta = { securitySchemes };

  const channel = z.enum([...INDEX_CATALOG_CHANNELS] as [string, ...string[]]);
  const kind = z.enum(["file", "question"]);
  const type = z.enum([...INDEX_CATALOG_TYPES] as [string, ...string[]]);
  const entry = z.object({
    channel: channel.describe("Telegram source channel of the post."),
    messageId: z.number().int().min(1).max(2147483647).describe("Telegram message id; (channel, messageId, kind) is the identity."),
    kind,
    moduleIndex: z.number().int().min(0).max(17).describe("Module position in the Index (0–17, site order)."),
    subject: z.string().trim().min(1).max(100).describe("Subject label exactly as the Index groups it, e.g. Anatomy."),
    type,
    caption: z.string().max(500).describe("Post caption shown on the Index; required for files, optional for questions."),
    filename: z.string().max(300).optional().describe("File name as served, files only."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Post date YYYY-MM-DD, files only."),
    lectureRefs: z.array(z.number().int().min(0).max(500)).max(40).optional().describe("Referenced lecture numbers, questions only; stored sorted and de-duplicated."),
    }).loose().describe("One verified Telegram post.");

  server.registerTool("list_index_catalog", {
    title: "List the live Index catalogue (admin)",
    description: "Administrators only: read the live Chaos Index catalogue (index.chaos.fail) exactly as the site consumes it. files are [messageId | \"ZatOona46/<id>\", moduleIndex, subject, type, caption, filename, date]; questions are [messageId, moduleIndex, subject, type, lectureRefs, caption]. Use this to check what is already published before adding entries. Public data, but restricted to administrator connections.",
    inputSchema: {},
    outputSchema: {
      files: z.array(z.tuple([z.union([z.number(), z.string()]), z.number(), z.string(), z.string(), z.string(), z.string(), z.string()])),
      questions: z.array(z.tuple([z.number(), z.number(), z.string(), z.string(), z.array(z.number()), z.string()])),
      generatedAt: z.number(),
    },
    annotations: read, _meta,
  }, input => run("list_index_catalog", input, (d) => `Index catalogue loaded: ${(d.files as unknown[]).length} files, ${(d.questions as unknown[]).length} question sets.`));

  server.registerTool("upsert_index_entries", {
    title: "Publish Index posts (admin)",
    description: "Administrators only, for verified Telegram posts: add or update Index catalogue entries (lectures, tutorials, practicals, CBLs, exams, resources, timetables and question sets). Idempotent by (channel, messageId, kind): replays report unchanged, edits update in place; at most 200 entries per call. The response counts created/updated/unchanged and returns rejected with reasons plus stored rows, so verify every run against its own writes. Newly added posts appear on the Index immediately; their SEO share pages join on the next site build.",
    inputSchema: {
      entries: z.array(entry).min(1).max(200),
      updatedBy: z.string().max(64).optional().describe("Short label recorded as the writer, e.g. \"morning-updater\"."),
    },
    outputSchema: {
      created: z.number(), updated: z.number(), unchanged: z.number(),
      rejected: z.array(z.object({ index: z.number(), reason: z.string() })),
      stored: z.array(z.unknown()),
    },
    annotations: write, _meta,
  }, input => run("upsert_index_entries", input, (d) => {
    const counts = d as { created: number; updated: number; unchanged: number; rejected: unknown[] };
    return `Index catalogue: ${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged${counts.rejected.length ? `, ${counts.rejected.length} rejected` : ""}.`;
  }));
}
