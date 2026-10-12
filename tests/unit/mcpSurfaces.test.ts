import { describe, expect, it, vi } from "vitest";
import inventory from "@/lib/mcp/inventory.json";
import { MCP_SURFACES, hasToolInSurface, parseMcpSurface } from "@/lib/mcp/surfaces";
import { connectMcpTestClient } from "../helpers/mcpClient";

const resourceMetadataUrl = "https://chaos.fail/.well-known/oauth-protected-resource/mcp";

describe("focused MCP tool surfaces", () => {
  it("keeps /mcp fully backward compatible and rejects unknown surface names", () => {
    expect(parseMcpSurface(null)).toBe("all");
    expect(parseMcpSurface("")).toBe("all");
    expect(parseMcpSurface("all")).toBe("all");
    expect(parseMcpSurface("forms")).toBe("forms");
    expect(parseMcpSurface("learn")).toBe("learn");
    expect(parseMcpSurface("live")).toBe("live");
    expect(parseMcpSurface("teams")).toBe("teams");
    expect(parseMcpSurface("admin")).toBeNull();
    expect(parseMcpSurface("forms,learn")).toBeNull();
    expect(parseMcpSurface("__proto__")).toBeNull();
  });

  it("each focused surface exposes a strict subset of known tools", async () => {
    for (const surface of ["forms", "learn", "live", "teams"] as const) {
      const expected = MCP_SURFACES[surface];
      expect(new Set(expected).size).toBe(expected.length);
      for (const name of expected) {
        expect(inventory.names).toContain(name);
        expect(hasToolInSurface(surface, name)).toBe(true);
      }
      const client = await connectMcpTestClient({ call: null, resourceMetadataUrl, surface }, { name: "test", version: "1.0" });
      const names = (await client.listTools()).tools.map(t => t.name).sort();
      expect(names).toEqual([...expected].sort());
      expect(names.length).toBeLessThan(inventory.names.length);
      expect(names).not.toContain("save_documentation");

    }
  });

  it("disabled tools cannot be called by name even with a valid account caller", async () => {
    const call = vi.fn().mockResolvedValue({ total: 0, items: [] });
    const client = await connectMcpTestClient({ call, resourceMetadataUrl, surface: "forms" }, { name: "test", version: "1.0" });
    const blocked = await client.callTool({ name: "delete_lesson_blocks", arguments: { lessonId: "forged", blockIds: [] } });
    expect(blocked.isError).toBe(true);
    expect(call).not.toHaveBeenCalled();
  });

  it("maintains isolated tools for distinct workflows", () => {
    expect(hasToolInSurface("forms", "create_lesson")).toBe(false);
    expect(hasToolInSurface("learn", "create_form")).toBe(false);
    expect(hasToolInSurface("live", "create_form")).toBe(true);
    expect(hasToolInSurface("teams", "moderate_admin_user")).toBe(false);
    expect(hasToolInSurface("all", "moderate_admin_user")).toBe(true);
  });
});
