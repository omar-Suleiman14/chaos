import { ADMIN_CRM_TOOLS, ADMIN_PLATFORM_TOOLS } from "./admin";
import { McpToolError } from "./errors";
const MCP_PERMISSIONS = ["read_content", "edit_content", "publish_content", "aggregate_analytics", "individual_responses", "collaborators", "destructive", "admin_crm", "admin_operations"] as const;
export type McpPermission = (typeof MCP_PERMISSIONS)[number];
/** Categories are separate from identity scopes; provider-issued grants can map here later. */
export function permissionForTool(tool: string): McpPermission {
 if ((ADMIN_PLATFORM_TOOLS as readonly string[]).includes(tool) || ["list_documentation", "save_documentation"].includes(tool)) return "admin_operations";
 if ((ADMIN_CRM_TOOLS as readonly string[]).includes(tool)) return "admin_crm";
 if (["list_crm_contacts", "get_crm_contact", "save_crm_contact", "add_crm_note"].includes(tool)) return "admin_crm";
 if (["list_responses", "export_form_responses", "list_my_students"].includes(tool)) return "individual_responses";
 if (tool.includes("collaborator")) return "collaborators";
 if (["invite_team_member", "revoke_team_invitation", "accept_team_invitation", "change_team_member_role", "remove_team_member", "share_with_team", "unshare_from_team"].includes(tool)) return "collaborators";
 if (["get_results", "get_form_advanced_analytics"].includes(tool)) return "aggregate_analytics";
 if (tool.startsWith("publish_") || tool === "host_game") return "publish_content";
 if (tool.startsWith("delete_") || ["unpublish_course", "set_course_archived", "set_form_status", "set_lesson_lifecycle", "set_flashcard_set_lifecycle", "restart_lesson_progress", "restore_lesson_version", "end_game", "edit_lesson_blocks"].includes(tool)) return "destructive";
 if (/^(get_|list_|search_)/.test(tool) || tool === "export_course_manifest") return "read_content";
 return "edit_content";
}
export function requireToolPermission(tool: string, allowed?: readonly McpPermission[]) {
 const category = permissionForTool(tool);
 if (allowed && !allowed.includes(category)) throw new McpToolError("PERMISSION_DENIED", `This connection does not allow ${category}.`);
}
