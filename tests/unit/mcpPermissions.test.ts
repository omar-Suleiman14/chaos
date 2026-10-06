import { expect, it } from "vitest";
import { permissionForTool, requireToolPermission } from "@/lib/mcp/permissions";
import { McpToolError } from "@/lib/mcp/errors";
it("separates sensitive answers, collaborators and destructive changes from summary reads", () => {
 expect(permissionForTool("get_results")).toBe("aggregate_analytics");
 expect(permissionForTool("export_form_responses")).toBe("individual_responses");
 for (const [tool, allowed] of [["list_responses", "aggregate_analytics"], ["publish_lesson", "edit_content"]] as const) {
  let thrown: unknown;
  try { requireToolPermission(tool, [allowed]); } catch (error) { thrown = error; }
  expect(thrown).toBeInstanceOf(McpToolError);
  expect((thrown as McpToolError).code).toBe("PERMISSION_DENIED");
 }
 expect(permissionForTool("change_form_collaborator")).toBe("collaborators");
 expect(permissionForTool("restart_lesson_progress")).toBe("destructive");
});
