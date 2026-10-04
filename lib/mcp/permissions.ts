export const MCP_PERMISSIONS = ["read_content", "edit_content", "publish_content", "aggregate_analytics", "individual_responses", "collaborators", "destructive"] as const;
export type McpPermission = (typeof MCP_PERMISSIONS)[number];
/** Categories are separate from identity scopes; provider-issued grants can map here later. */
export function permissionForTool(tool: string): McpPermission {
 if (["list_responses", "export_form_responses"].includes(tool)) return "individual_responses";
 if (tool.includes("collaborator")) return "collaborators";
 if (["get_results", "get_form_advanced_analytics"].includes(tool)) return "aggregate_analytics";
 if (tool.startsWith("publish_") || tool === "host_game") return "publish_content";
 if (tool.startsWith("delete_") || ["unpublish_course", "set_course_archived", "set_form_status", "set_lesson_lifecycle", "set_flashcard_set_lifecycle", "restart_lesson_progress", "restore_lesson_version", "end_game", "edit_lesson_blocks"].includes(tool)) return "destructive";
 if (/^(get_|list_|search_)/.test(tool)) return "read_content";
 return "edit_content";
}
export function requireToolPermission(tool: string, allowed?: readonly McpPermission[]) {
 const category = permissionForTool(tool);
 if (allowed && !allowed.includes(category)) throw new Error(`PERMISSION_DENIED: This connection does not allow ${category}.`);
}
