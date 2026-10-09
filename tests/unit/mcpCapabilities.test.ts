import { expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer, type McpCaller } from "@/lib/mcp/server";
import { mcpToolGroups } from "@/convex/learnCapabilityModel";

async function connect(call: McpCaller | null) {
  const server = createChaosMcpServer({ call, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

it("advertises only registered tools and covers courses, flashcards and games", async () => {
  const { tools } = await (await connect(null)).listTools();
  const names = new Set(tools.map(t => t.name));
  for (const group of Object.values(mcpToolGroups)) for (const tool of group.tools) expect(names, tool).toContain(tool);
  for (const area of ["lessons", "courses", "flashcards", "games"]) expect(Object.keys(mcpToolGroups)).toContain(area);
  const capabilities = tools.find(t => t.name === "get_learn_capabilities")!;
  for (const word of ["courses", "flashcards", "games"]) expect(capabilities.description).toContain(word);
  const byName = Object.fromEntries(tools.map(t => [t.name, t]));
  for (const name of ["create_lesson", "save_lesson_draft"]) expect(byName[name].description).toMatch(/metadata\.coverUrl[\s\S]*metadata\.icon/);
  for (const name of ["list_courses", "list_flashcard_sets", "get_flashcard_set", "get_lesson_flashcards"]) expect(byName[name].annotations?.readOnlyHint).toBe(true);
  for (const name of ["set_course_archived", "unpublish_course", "set_flashcard_set_lifecycle", "save_flashcard_set", "detach_lesson_flashcards"]) expect(byName[name].annotations?.destructiveHint).toBe(true);
});

it("validates flashcard input, fills conceptIds and never forwards a client actor", async () => {
  const call = vi.fn<McpCaller>(async () => ({ setId: "set1", revision: 0 }));
  const client = await connect(call);
  const result = await client.callTool({ name: "create_flashcard_set", arguments: { title: "Deck", cards: [{ id: "c1", front: "Q", back: "A" }], userId: "user_evil" } });
  expect(result.isError).toBeFalsy();
  // A private draft by default: nothing is published without an explicit request.
  expect(call).toHaveBeenCalledTimes(1);
  const [tool, input] = call.mock.calls[0];
  expect(tool).toBe("create_flashcard_set");
  expect(input).toEqual({ title: "Deck", cards: [{ id: "c1", front: "Q", back: "A", conceptIds: [] }] });
  expect(result.structuredContent).toMatchObject({ published: false });
  call.mockClear();
  await client.callTool({ name: "create_flashcard_set", arguments: { title: "Deck", cards: [{ id: "c1", front: "Q", back: "A" }], publish: true } });
  expect(call.mock.calls[1]).toEqual(["publish_flashcard_set", { setId: "set1", expectedRevision: 0, visibility: "public" }]);
  expect((await client.callTool({ name: "create_flashcard_set", arguments: { title: "Deck", cards: [{ id: "bad id", front: "Q", back: "A" }] } })).isError).toBe(true);
  expect((await client.callTool({ name: "publish_flashcard_set", arguments: { setId: "set1", expectedRevision: 0, visibility: "unlisted" } })).isError).toBe(true);
});
