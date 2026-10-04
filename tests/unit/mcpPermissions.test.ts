import { expect, it } from "vitest";
import { permissionForTool, requireToolPermission } from "@/lib/mcp/permissions";
it("separates sensitive answers, collaborators and destructive changes from summary reads", () => {
 expect(permissionForTool("get_results")).toBe("aggregate_analytics");
 expect(permissionForTool("export_form_responses")).toBe("individual_responses");
 expect(() => requireToolPermission("list_responses", ["aggregate_analytics"])).toThrow("PERMISSION_DENIED");
 expect(() => requireToolPermission("publish_lesson", ["edit_content"])).toThrow("PERMISSION_DENIED");
 expect(permissionForTool("change_form_collaborator")).toBe("collaborators");
 expect(permissionForTool("restart_lesson_progress")).toBe("destructive");
});
