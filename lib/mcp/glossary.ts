import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
const id = z.string().min(1).max(100);
const entry = z.object({
  term: z.string().trim().min(1).max(100).describe("The word or phrase exactly as it appears in the lesson."),
  aliases: z.array(z.string().trim().min(1).max(100)).max(5).optional().describe("Other forms that appear in the text, such as plurals."),
  definition: z.string().trim().min(1).max(1000).describe("A short plain definition in the lesson's language."),
  translation: z.string().trim().min(1).max(200).optional().describe("The word in the learner's language."),
  explanation: z.string().trim().min(1).max(1500).optional().describe("What the word means, explained simply in the learner's language — not just a literal translation."),
  language: z.string().trim().min(2).max(35).optional().describe("Language code of translation and explanation; defaults to ar."),
  pronunciation: z.string().trim().min(1).max(100).optional(),
});
export function registerGlossaryTools(server: McpServer, run: (tool: string, input: Record<string, unknown>, summarize: (data: Record<string, unknown>) => string) => Promise<CallToolResult>, securitySchemes: { type: string; scopes: string[] }[]) {
  const _meta = { securitySchemes }, read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }, write = { ...read, readOnlyHint: false };
  server.registerTool("set_lesson_glossary", {
    description: "Add look-up definitions to a lesson the person can edit. Readers see each term highlighted and tap it for a card with the definition, translation and the meaning explained in their language, like Look Up on Apple devices. Use proactively after writing or editing a lesson: pick the technical, rare or easily confused words a learner may not know (usually 5–30) and fill translation and explanation in the learner's language (Arabic unless told otherwise). Merges by term; replace true swaps the whole list; remove deletes terms. Live at once — no publish needed and the lesson text is unchanged.",
    inputSchema: { lessonId: id, terms: z.array(entry).max(100), remove: z.array(z.string().trim().min(1).max(100)).max(200).optional(), replace: z.boolean().optional() },
    outputSchema: { terms: z.array(z.string()) },
    annotations: { ...write, idempotentHint: true }, _meta,
  }, ({ terms, ...input }) => run("set_lesson_glossary", { ...input, terms: terms.map(t => ({ ...t, language: t.language ?? "ar" })) }, data => `Glossary saved with ${(data.terms as unknown[] | undefined)?.length ?? 0} terms.`));
  server.registerTool("get_lesson_glossary", { description: "Read the look-up glossary of a lesson the person can read: each term with its definition, translation and explanation.", inputSchema: { lessonId: id }, outputSchema: { entries: z.array(z.record(z.string(), z.unknown())).max(200) }, annotations: read, _meta }, input => run("get_lesson_glossary", input, data => `${(data.entries as unknown[] | undefined)?.length ?? 0} glossary terms.`));
}
