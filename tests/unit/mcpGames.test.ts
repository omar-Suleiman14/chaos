import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer, McpToolError } from "@/lib/mcp/server";
import type { McpCaller } from "@/lib/mcp/server";
import { parseGameDraftInput } from "@/convex/mcpContract";

async function connect(call: McpCaller | null) {
  const server = createChaosMcpServer({ call, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
  const client = new Client({ name: "games-test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

const input = { title: "Space quiz", questions: [{ type: "single_choice", label: "Largest planet?", options: ["Earth", "Jupiter"], correctAnswers: ["Jupiter"] }] };
const room = {
  id: "game_1", kind: "live_game", title: "Space quiz", state: "lobby", sourceId: "form_1", pin: "123456",
  hostUrl: "https://chaos.fail/dashboard/live/1", joinUrl: "https://chaos.fail/play?pin=123456", questionIndex: -1,
  questionCount: 1, skippedQuestions: 0, questionEndsAt: null,
  settings: { timeLimitSec: 20, showAnswerLabels: true, maxPlayers: 500, language: "en", autoAdvance: true, breakSec: 5, startWhenPlayers: 0 },
  nextStepAt: null, startsAt: null,
  theme: null, createdAt: "2026-09-30T00:00:00.000Z", endedAt: null, resultsStatus: null, savedResponses: 0, unsavedResponses: 0,
};

describe("MCP game contract", () => {
  it("forces quiz mode and refuses unsupported, empty, ambiguous or ungraded questions", () => {
    expect(parseGameDraftInput({ ...input, quizMode: false })).toMatchObject({ input: { quizMode: true } });
    for (const questions of [[], [{ type: "long_text", label: "Essay" }], [{ ...input.questions[0], options: ["Earth"] }], [{ ...input.questions[0], correctAnswers: [] }], [{ ...input.questions[0], correctAnswers: ["Earth", "Jupiter"] }], [{ ...input.questions[0], options: ["Jupiter", " Jupiter "] }], [{ ...input.questions[0], options: ["", "Jupiter"] }], [{ ...input.questions[0], correctAnswers: ["Mars"] }]]) {
      expect(parseGameDraftInput({ title: "Q", questions })).toHaveProperty("errors");
    }
  });

  it("resolves the chosen theme, publishes the quiz by default, and never hosts", async () => {
    const call = vi.fn<McpCaller>(async () => ({ id: "form_1", kind: "form", title: input.title, status: "draft", editUrl: "e", shareUrl: null, resultsUrl: "r", readyToPublish: true, problems: [] }));
    const client = await connect(call);
    expect((await client.callTool({ name: "create_game_draft", arguments: { ...input, theme: "Midnight", sound: "off" } })).isError).toBeFalsy();
    expect(call.mock.calls.map(([tool]) => tool)).toEqual(["create_game_draft", "publish_form"]);
    expect(call).toHaveBeenCalledWith("create_game_draft", { form: expect.objectContaining({ theme: expect.objectContaining({ preset: "midnight" }), sound: "off", questions: input.questions }) });
    call.mockClear();
    await client.callTool({ name: "create_game_draft", arguments: { ...input, publish: false } });
    expect(call.mock.calls.map(([tool]) => tool)).toEqual(["create_game_draft"]);
  });

  it("forwards timer/label settings and guarded advances with safe output", async () => {
    const call = vi.fn<McpCaller>(async (tool) => tool === "list_games" ? { games: [room], nextCursor: null } : room);
    const client = await connect(call);
    for (const [name, args] of [
      ["host_game", { id: "form_1", theme: "Terracotta", timeLimitSec: 30, showAnswerLabels: true }],
      ["set_game_settings", { id: "game_1", theme: "Paper", showAnswerLabels: false }],
      ["advance_game", { id: "game_1", from: "lobby", questionIndex: -1 }],
      ["get_game", { id: "game_1" }], ["end_game", { id: "game_1" }], ["list_games", { limit: 10 }],
    ] as const) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual(name === "list_games" ? { games: [room], nextCursor: null } : room);
    }
    expect(call).toHaveBeenCalledWith("host_game", expect.objectContaining({ id: "form_1", timeLimitSec: 30, showAnswerLabels: true, theme: expect.objectContaining({ preset: "terracotta" }) }));
    expect(call).toHaveBeenCalledWith("advance_game", { id: "game_1", from: "lobby", questionIndex: -1 });
    call.mockClear();
    for (const args of [{ id: "game_1" }, { id: "game_1", timeLimitSec: 4 }, { id: "game_1", timeLimitSec: 241 }, { id: "game_1", theme: "nonsense" }]) {
      expect((await client.callTool({ name: "set_game_settings", arguments: args })).isError).toBe(true);
    }
    expect(call).not.toHaveBeenCalled();
  });

  it("asks for auth on every game tool and does not fabricate success for denied accounts", async () => {
    const client = await connect(null);
    for (const [name, args] of [["create_game_draft", input], ["list_games", {}], ["get_game", { id: "game_1" }], ["host_game", { id: "form_1" }], ["set_game_settings", { id: "game_1", timeLimitSec: 30 }], ["advance_game", { id: "game_1", from: "lobby", questionIndex: -1 }], ["end_game", { id: "game_1" }]] as const) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result._meta)).toContain("resource_metadata=");
    }
    const denied = await connect(async () => { throw new McpToolError("NOT_FOUND", "No game in this account."); });
    const result = await denied.callTool({ name: "end_game", arguments: { id: "game_1" } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });
});
