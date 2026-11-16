import { expect, it, vi } from "vitest";
import { connectMcpTestClient } from "../helpers/mcpClient";

it("registers three read-only student tools and never accepts a tool-supplied actor", async () => {
  const call = vi.fn(async () => ({ courses: [], nextCursor: null }));
  const client = await connectMcpTestClient({
    call, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp",
  }, { name: "course-chat-test", version: "1" });
  try {
    const all = (await client.listTools()).tools;
    for (const name of ["list_enrolled_courses", "search_enrolled_course_lectures", "get_enrolled_course_lecture"]) {
      const tool = all.find(item => item.name === name);
      expect(tool).toBeDefined();
      expect(tool!.annotations).toMatchObject({
        readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
      });
      expect(tool!._meta?.["chaos/permission"]).toBe("read_content");
      expect(tool!.inputSchema.properties).not.toHaveProperty("userId");
      expect(tool!.outputSchema).toBeDefined();
    }
    const invalidSearch = await client.callTool({
      name: "search_enrolled_course_lectures", arguments: { courseId: "course_1", query: "" },
    });
    expect(invalidSearch.isError).toBe(true);
    const invalidPage = await client.callTool({
      name: "get_enrolled_course_lecture", arguments: { courseId: "course_1", lessonId: "lesson_1", limit: 11 },
    });
    expect(invalidPage.isError).toBe(true);
    const result = await client.callTool({
      name: "list_enrolled_courses", arguments: { userId: "another_account" },
    });
    expect(result.isError).toBeFalsy();
    expect(call).toHaveBeenCalledWith("list_enrolled_courses", {});
  } finally {
    await client.close();
  }
});
