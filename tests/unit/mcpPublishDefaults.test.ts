import { expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer, type McpCaller } from "@/lib/mcp/server";

const metadata = { title: "Review first", description: "", language: "en", tags: [] };
const document = { schemaVersion: 1, blocks: [] };
const cases = [
  { name: "create_form", input: { title: "Review first", questions: [{ type: "short_text", label: "Name" }] }, calls: ["create_form"] },
  { name: "create_game_draft", input: { title: "Review first", questions: [{ type: "single_choice", label: "2 + 2?", options: ["3", "4"], correctAnswers: ["4"] }] }, calls: ["create_game_draft"] },
  { name: "create_lesson", input: { metadata, document }, calls: ["create_lesson"] },
  { name: "create_full_course", input: { title: "Review first", lessons: [{ title: "Lesson", document }] }, calls: ["create_course", "update_course", "add_course_lesson", "save_lesson_draft"] },
  { name: "create_flashcard_set", input: { title: "Review first", cards: [{ id: "c1", front: "Q", back: "A" }] }, calls: ["create_flashcard_set"] },
];

for (const scenario of cases) for (const publish of [undefined, false]) {
  it(`${scenario.name} stays a draft with publish ${String(publish)}, even with public visibility`, async () => {
    const call = vi.fn<McpCaller>(async tool => {
      if (tool === "create_course") return { courseId: "course1" };
      if (tool === "add_course_lesson" || tool === "create_lesson") return { lessonId: "lesson1", revision: 0 };
      if (tool === "create_flashcard_set") return { setId: "set1", revision: 0 };
      if (tool === "create_form" || tool === "create_game_draft") return { id: "form1", kind: "form", title: "Review first", status: "draft", editUrl: "https://example.test/edit", shareUrl: null, resultsUrl: "https://example.test/results", readyToPublish: true, problems: [] };
      return { ok: true, revision: 1 };
    });
    const server = createChaosMcpServer({ call, resourceMetadataUrl: "https://example.test/.well-known/oauth-protected-resource/mcp" });
    const client = new Client({ name: "publish-defaults", version: "1" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const result = await client.callTool({ name: scenario.name, arguments: { ...scenario.input, visibility: "public", ...(publish === undefined ? {} : { publish }), userId: "foreign-actor" } });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({ published: false });
      expect(call.mock.calls.map(([tool]) => tool)).toEqual(scenario.calls);
      for (const [, input] of call.mock.calls) {
        expect(input).not.toHaveProperty("userId");
        expect(input).not.toHaveProperty("publish");
        expect(input).not.toHaveProperty("form.publish");
      }
    } finally { await client.close(); await server.close(); }
  });
}
