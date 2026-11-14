import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const ref = z.string().min(1).max(100);
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const excerpt = z.object({ blockId: ref, type: z.string(), text: z.string() });

/** Retrieval for the signed-in student, never a server-side ungrounded chat model. */
export function registerCourseChatTools(
  server: McpServer,
  run: (tool: string, input: Record<string, unknown>, summarize: (data: Record<string, unknown>) => string) => Promise<CallToolResult>,
  securitySchemes: { type: string; scopes: string[] }[],
) {
  const meta = { securitySchemes };
  server.registerTool("list_enrolled_courses", {
    description: "List this connected student's currently approved and enrolled published courses. Each page rechecks the teacher's approval, signed-in enrollment, course publication and live restrictions. Empty pages can occur; continue with nextCursor. Never reveals pending/rejected courses or another student's enrollment.",
    inputSchema: { limit: z.number().int().min(1).max(10).optional(), cursor: z.string().max(2000).optional() },
    outputSchema: { courses: z.array(z.object({ courseId: ref, title: z.string(), description: z.string(), language: z.string(), lessonCount: z.number() })), nextCursor: z.string().nullable() },
    annotations: read, _meta: meta,
  }, input => run("list_enrolled_courses", input, data => `${(data.courses as unknown[]).length} enrolled course(s) in this page.`));

  server.registerTool("search_enrolled_course_lectures", {
    description: "Search published lecture titles and text in one course the connected student is currently approved to access. Search 1-15 lectures per call; continue nextOffset (which advances by scanned lectures, even when results are empty). Each text snippet carries the exact published lesson version and block ID for grounding. No draft text, responses, source-file bytes, grading or hidden material. Results are evidence, not an AI-generated explanation.",
    inputSchema: { courseId: ref, query: z.string().trim().min(1).max(200), offset: z.number().int().min(0).max(100).optional(), limit: z.number().int().min(1).max(15).optional() },
    outputSchema: { courseId: ref, results: z.array(z.object({ lessonId: ref, versionId: ref, title: z.string(), snippets: z.array(excerpt) })), nextOffset: z.number().int().nullable() },
    annotations: read, _meta: meta,
  }, input => run("search_enrolled_course_lectures", input, data => `${(data.results as unknown[]).length} matching lecture(s) in this page.`));

  server.registerTool("get_enrolled_course_lecture", {
    description: "Read 1-10 blocks at a time from the immutable published lecture version of an approved and enrolled course. Continue nextOffset until null. Each block has a stable ID, versionId and text for source citations. Media returns only published captions, not inaccessible PDF/source bytes or exams/answers. Rechecks live student permission for every page; never cache a previous answer across revocation.",
    inputSchema: { courseId: ref, lessonId: ref, offset: z.number().int().min(0).max(500).optional(), limit: z.number().int().min(1).max(10).optional() },
    outputSchema: { courseId: ref, lessonId: ref, versionId: ref, title: z.string(), blocks: z.array(excerpt), totalBlocks: z.number(), nextOffset: z.number().int().nullable() },
    annotations: read, _meta: meta,
  }, input => run("get_enrolled_course_lecture", input, () => "Published lecture excerpt loaded."));
}
