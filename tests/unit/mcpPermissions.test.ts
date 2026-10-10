import { expect, it } from "vitest";
import { permissionForTool, requireToolPermission } from "@/lib/mcp/permissions";
import { McpToolError } from "@/lib/mcp/errors";
import schemas from "@/lib/mcp/tool-schemas.json";

it("preserves every public and administrator tool's reviewed permission", () => {
 for (const group of Object.values(schemas)) {
  for (const [tool, descriptor] of Object.entries(group)) {
   expect(permissionForTool(tool), tool).toBe(descriptor.permission);
   expect(() => requireToolPermission(tool, [descriptor.permission])).not.toThrow();
   expect(() => requireToolPermission(tool, [])).toThrow(McpToolError);
  }
 }
});

it("rejects unclassified operations instead of inferring access from their names", () => {
 for (const tool of ["get_new_tool", "publish_new_tool", "new_tool", "toString", "__proto__", "constructor"]) {
  expect(() => permissionForTool(tool)).toThrow("has no permission classification");
  expect(() => requireToolPermission(tool)).toThrow(McpToolError);
  expect(() => requireToolPermission(tool, ["edit_content", "read_content", "publish_content"])).toThrow(McpToolError);
 }
});
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
