import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const kind = z.enum([
  "course_announcement", "course_calendar", "course_message",
  "course_assignment", "course_enrollment", "course_result",
]);
const notice = z.object({
  _id: z.string(), kind: z.string(), message: z.string(),
  formId: z.string().optional(), href: z.string().nullable(),
  createdAt: z.number(), read: z.boolean(),
});
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
type Run = (tool: string, input: Record<string, unknown>,
  summarize: (data: Record<string, unknown>) => string) => Promise<CallToolResult>;

export function registerNotificationTools(
  server: McpServer, run: Run, securitySchemes: { type: string; scopes: string[] }[],
) {
  const _meta = { securitySchemes };
  const prefsOutput = { kinds: z.array(kind), disabled: z.array(kind) };
  server.registerTool("list_notifications", {
    description: "Read only your authorized Chaos in-app notifications and unread count; current course access is rechecked and withheld grades are not included.",
    inputSchema: {}, outputSchema: { items: z.array(notice), unread: z.number() },
    annotations: read, _meta,
  }, input => run("list_notifications", input, () => "Your notifications loaded."));
  server.registerTool("mark_notifications_read", {
    description: "Mark your own notification IDs as read (maximum 100), or omit IDs to mark your latest 100. Does not mark other users' notifications.",
    inputSchema: { ids: z.array(z.string().min(1).max(100)).max(100).optional() },
    outputSchema: { ok: z.boolean() }, annotations: write, _meta,
  }, input => run("mark_notifications_read", input, () => "Your notifications marked read."));
  server.registerTool("get_notification_preferences", {
    description: "Read your in-app academic notification categories and disabled selections.",
    inputSchema: {}, outputSchema: prefsOutput, annotations: read, _meta,
  }, input => run("get_notification_preferences", input, () => "Your notification preferences loaded."));
  server.registerTool("set_notification_preference", {
    description: "Enable or disable one category of your own in-app course notifications. No browser push or email preference is changed.",
    inputSchema: { kind, enabled: z.boolean() },
    outputSchema: prefsOutput, annotations: write, _meta,
  }, input => run("set_notification_preference", input, () => "Your notification preference updated."));
}
