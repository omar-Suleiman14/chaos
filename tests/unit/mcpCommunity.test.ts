import { describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCommunityTools } from "@/lib/mcp/community";

describe("MCP community descriptor", () => {
  it("registers an idempotent save with explicit withdrawal and no source access", async () => {
    const server = new McpServer({ name: "test", version: "1" });
    const register = vi.spyOn(server, "registerTool");
    const run = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "Saved" }] });
    registerCommunityTools(server, run, [{ type: "oauth2", scopes: ["chaos"] }]);
    const [name, config, callback] = register.mock.calls[0] as unknown as [string, { description?: string }, (input: Record<string, unknown>, extra: unknown) => Promise<unknown>];
    expect(name).toBe("save_lesson");
    expect(config).toMatchObject({ annotations: { idempotentHint: true, readOnlyHint: false, destructiveHint: false } });
    expect(config.description).toContain("Source file access is not granted");
    await callback({ lessonId: "lesson", saved: false }, {});
    expect(run).toHaveBeenCalledWith("save_lesson", { lessonId: "lesson", saved: false }, expect.any(Function));
    await server.close();
  });
});
