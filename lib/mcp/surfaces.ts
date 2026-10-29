/**
 * Opt-in, stable tool surfaces for clients that cannot handle the whole MCP registry.
 * The canonical /mcp endpoint keeps the full registry for existing connections.
 * These lists deliberately reuse canonical tool IDs; don't alias or rename tools.
 */
export const MCP_SURFACES = {
  all: null,
  forms: [
    "search_forms", "get_form", "get_results", "list_responses",
    "create_form", "update_form", "publish_form", "set_form_status",
    "list_themes", "set_form_theme", "set_form_sound", "set_form_branching",
    "upsert_form_file_question", "get_form_response_controls", "set_form_response_controls",
    "get_form_advanced_analytics", "export_form_responses", "list_form_collaborators",
    "change_form_collaborator", "fork_quiz", "get_quiz_fork_lineage",
  ],
  learn: [
    "list_courses", "get_course", "create_course", "create_full_course", "update_course",
    "add_course_lesson", "set_course_outline", "set_course_modules", "publish_course",
    "unpublish_course", "set_course_archived", "get_course_progress", "remember_course",
    "list_lessons", "search_lessons", "search_learn_directory", "get_learn_capabilities",
    "get_lesson", "get_lesson_outline", "get_lesson_sources", "get_learn_source_metadata",
    "create_lesson", "save_lesson_draft", "add_lesson_blocks", "update_lesson_blocks",
    "edit_lesson_blocks", "move_lesson_blocks", "delete_lesson_blocks",
    "publish_lesson", "set_lesson_lifecycle", "list_lesson_versions", "get_lesson_version",
    "fork_lesson", "restore_lesson_version", "save_lesson", "get_lesson_progress",
    "get_weak_area_actions", "restart_lesson_progress", "list_flashcard_sets",
    "get_flashcard_set", "create_flashcard_set", "save_flashcard_set",
    "publish_flashcard_set", "set_flashcard_set_lifecycle", "attach_lesson_flashcards",
    "detach_lesson_flashcards", "get_lesson_flashcards", "attach_lesson_quiz",
    "get_lesson_quizzes", "get_study_lesson_skill", "build_study_lesson",
    "checkpoint_study_lesson", "get_study_lesson_job", "get_study_lesson_checkpoint",
    "finalize_study_lesson", "publish_study_lesson", "set_study_teaching_profile",
    "upload_study_source", "get_study_source_content", "register_study_reference",
    "publish_study_source", "get_lesson_glossary", "set_lesson_glossary",
  ],
  live: [
    "search_forms", "get_form", "get_results", "create_form", "publish_form",
    "create_game_draft", "list_games", "get_game", "host_game",
    "set_game_settings", "advance_game", "end_game", "create_lesson_live_game",
  ],
  teams: [
    "list_teams", "create_team", "rename_team", "list_team_members",
    "invite_team_member", "list_team_invitations", "revoke_team_invitation",
    "accept_team_invitation", "change_team_member_role", "remove_team_member",
    "list_team_resources", "share_with_team", "unshare_from_team",
    "list_folders", "list_folder_contents", "create_folder", "move_folder", "add_folder_member",
  ],
} as const;

export type McpSurface = keyof typeof MCP_SURFACES;

/** Unknown URLs fail closed rather than accidentally revealing the full registry. */
export function parseMcpSurface(value: string | null): McpSurface | null {
  if (value === null || value === "") return "all";
  return Object.hasOwn(MCP_SURFACES, value) ? value as McpSurface : null;
}
export function hasToolInSurface(surface: McpSurface, tool: string): boolean {
  const allowed = MCP_SURFACES[surface];
  return allowed === null || (allowed as readonly string[]).includes(tool);
}
