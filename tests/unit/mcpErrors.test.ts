import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { mcpErrorCode } from "@/convex/mcpErrors";
import { errorCategory, McpToolError, toolError } from "@/lib/mcp/errors";

const textOf = (result: ReturnType<typeof toolError>) => (result.content[0] as { text: string }).text;
const metaOf = (result: ReturnType<typeof toolError>) => (result._meta as { "chaos/error": { code: string; category: string; retryable: boolean; details?: unknown } })["chaos/error"];

describe("Convex MCP error codes", () => {
  it("keeps coded errors and strips request ids and stack frames", () => {
    expect(mcpErrorCode(new Error("[Request ID: 1a2b] Server Error\nUncaught Error: NOT_FOUND: Lesson not found\n    at handler (../convex/lessons.ts:10:9)"))).toEqual({ code: "NOT_FOUND", message: "Lesson not found" });
    expect(mcpErrorCode(new ConvexError({ code: "REVISION_CONFLICT", currentRevision: 4 }))).toMatchObject({ code: "REVISION_CONFLICT", details: { currentRevision: 4 } });
    expect(mcpErrorCode(new ConvexError({ code: "VALIDATION", problems: [{ path: "blocks" }] }))).toMatchObject({ code: "VALIDATION_FAILED", details: { problems: [{ path: "blocks" }] } });
  });

  it("sorts readable uncoded messages instead of calling them internal", () => {
    expect(mcpErrorCode(new Error("Uncaught Error: Source not found or unauthorized")).code).toBe("NOT_FOUND");
    expect(mcpErrorCode(new Error("Version not accessible")).code).toBe("NOT_FOUND");
    expect(mcpErrorCode(new Error("Only the owner may restore versions")).code).toBe("FORBIDDEN");
    expect(mcpErrorCode(new Error("Lesson is not public")).code).toBe("INVALID_STATUS");
    expect(mcpErrorCode(new Error("Page size must be 1–50")).code).toBe("VALIDATION_FAILED");
    expect(mcpErrorCode(new Error("Version mapping limit reached")).code).toBe("VALIDATION_FAILED");
    const args = mcpErrorCode(new Error("ArgumentValidationError: Value does not match validator.\nPath: .lessonId\nValue: \"x\"\nValidator: v.id(\"lessons\")"));
    expect(args).toEqual({ code: "VALIDATION_FAILED", message: "The value at lessonId is not valid; use ids and values returned by Chaos tools." });
    expect(mcpErrorCode(new Error("Validator error: Expected ID for table \"forms\", got `quiz_1`"))).toEqual({ code: "VALIDATION_FAILED", message: "The arguments are not valid: Expected ID for table \"forms\", got `quiz_1`" });
  });

  it("leaves programming faults internal", () => {
    expect(mcpErrorCode(new Error("Uncaught TypeError: Cannot read properties of undefined (reading 'x')")).code).toBe("ERROR");
    expect(mcpErrorCode(new Error("Something odd happened")).code).toBe("ERROR");
  });
});

describe("MCP tool errors", () => {
  it("states code, category and a recovery hint, with the same fields in _meta", () => {
    const result = toolError(new McpToolError("REVISION_CONFLICT", "The lesson changed; reload before editing.", { currentRevision: 3 }));
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("REVISION_CONFLICT (revision_conflict): The lesson changed; reload before editing. Reload the current state, then retry with its revision.\n\n{\"currentRevision\":3}");
    expect(metaOf(result)).toEqual({ code: "REVISION_CONFLICT", category: "revision_conflict", retryable: true, details: { currentRevision: 3 } });
  });

  it("keeps the code of plain `CODE: message` errors", () => {
    expect(metaOf(toolError(new Error("PERMISSION_DENIED: This connection does not allow publish_content.")))).toMatchObject({ code: "PERMISSION_DENIED", category: "permission" });
  });

  it("turns the SDK's schema failures into readable problems", () => {
    const result = toolError(new Error("MCP error -32602: Input validation error: Invalid arguments for tool create_lesson: Invalid input: expected string, received undefined at metadata.title\nToo big: expected array to have <=500 items at document.blocks"));
    expect(metaOf(result)).toMatchObject({ code: "VALIDATION_FAILED", category: "validation", details: { problems: ["metadata.title: Invalid input: expected string, received undefined", "document.blocks: Too big: expected array to have <=500 items"] } });
    expect(textOf(result)).toMatch(/^VALIDATION_FAILED \(validation\): Invalid arguments for create_lesson: metadata\.title: /);
  });

  it("hides unexpected errors behind a retryable internal error", () => {
    const result = toolError(new TypeError("Cannot read properties of undefined"));
    expect(metaOf(result)).toEqual({ code: "ERROR", category: "internal", retryable: true });
    expect(textOf(result)).not.toContain("Cannot read");
  });

  it("separates ownership from other refusals", () => {
    expect(errorCategory("FORBIDDEN", "Only the lesson owner can attach assessments.")).toBe("ownership");
    expect(errorCategory("FORBIDDEN", "Admin access required.")).toBe("permission");
    expect(errorCategory("NOT_FOUND")).toBe("not_found");
    expect(errorCategory("INVALID_STATUS")).toBe("publication");
    expect(errorCategory("BUSINESS_REQUIRED")).toBe("plan");
    expect(errorCategory("ERROR")).toBe("internal");
  });
});
