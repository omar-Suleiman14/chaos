import { afterEach, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("points assistants at this installation's own origin, not chaos.fail", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://learn.school.example");
  vi.resetModules();
  const { createChaosMcpServer } = await import("@/lib/mcp/server");
  const server = createChaosMcpServer({ call: vi.fn(), resourceMetadataUrl: "https://learn.school.example/.well-known/oauth-protected-resource/mcp" });
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  try {
    const instructions = client.getInstructions()!;
    for (const link of ["https://learn.school.example/learn/<lessonId>", "https://learn.school.example/learn/courses/<courseId>", "https://learn.school.example/card"]) expect(instructions).toContain(link);
    expect(instructions).not.toContain("chaos.fail");
  } finally { await client.close(); }
});
