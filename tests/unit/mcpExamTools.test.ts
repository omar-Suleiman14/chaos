import { describe, expect, it } from "vitest";
import { connectMcpTestClient } from "../helpers/mcpClient";
import { permissionForTool } from "@/lib/mcp/permissions";

const tools = [
  "list_course_exams", "get_course_exam", "create_course_exam",
  "save_course_exam_plan", "preview_course_exam", "list_course_exam_candidates",
  "select_course_exam_questions", "autofill_course_exam", "import_quiz_to_course_exam", "seal_course_exam",
  "get_course_exam_settings", "save_course_exam_settings", "prepare_course_exam",
  "get_course_exam_audience", "assign_course_exam", "set_course_exam_entry",
  "get_course_exam_results",
];

describe("course Exam Mode MCP registration", () => {
  it("exposes all 17 tools on the regular Chaos connection with reviewed permissions", async () => {
    const client = await connectMcpTestClient({
      call: null,
      resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp",
    }, { name: "exam-test", version: "1.0" });
    const advertised = (await client.listTools()).tools;
    expect(advertised.filter(t => tools.includes(t.name))).toHaveLength(17);
    for (const name of tools) {
      const tool = advertised.find(t => t.name === name)!;
      expect(tool.description?.length).toBeGreaterThan(30);
      expect(tool.outputSchema).toBeDefined();
      expect(tool._meta?.["chaos/permission"]).toBe(permissionForTool(name));
    }
    expect(permissionForTool("get_course_exam_results")).toBe("individual_responses");
    expect(permissionForTool("set_course_exam_entry")).toBe("publish_content");
    expect(permissionForTool("import_quiz_to_course_exam")).toBe("edit_content");
    expect(advertised.find(t => t.name === "import_quiz_to_course_exam")?.annotations?.idempotentHint).toBe(false);
    expect(advertised.find(t => t.name === "assign_course_exam")?.annotations?.openWorldHint).toBe(true);
    expect(advertised.find(t => t.name === "create_course_exam")?.annotations?.idempotentHint).toBe(false);
    expect(advertised.find(t => t.name === "preview_course_exam")?.annotations?.readOnlyHint).toBe(true);
  });
});
