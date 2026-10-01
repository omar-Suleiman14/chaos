import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer } from "@/lib/mcp/server";
import type { McpCaller } from "@/lib/mcp/server";

async function connect(call: McpCaller | null) {
  const server = createChaosMcpServer({ call, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("Chaos MCP server", () => {
  it("lists every tool with review annotations and OAuth security schemes", async () => {
    const client = await connect(null);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_form_advanced_analytics", "export_form_responses", "list_form_collaborators", "change_form_collaborator",
      "create_form", "get_form", "get_results", "list_responses", "list_themes", "publish_form", "search_forms", "set_form_sound", "set_form_status", "set_form_theme", "update_form",
      "create_game_draft", "list_games", "get_game", "host_game", "set_game_settings", "advance_game", "end_game",
      "set_form_branching", "upsert_form_file_question", "get_form_response_controls", "set_form_response_controls", "save_lesson", "search_learn_directory", "fork_quiz", "get_quiz_fork_lineage", "attach_lesson_quiz", "get_lesson_quizzes", "create_lesson_live_game", "get_learn_capabilities", "list_lesson_versions", "get_lesson_version", "add_folder_member", "add_lesson_blocks", "create_folder", "create_lesson", "create_lesson_curriculum_mapping", "delete_lesson_blocks", "edit_lesson_blocks", "fork_lesson", "get_learn_source_metadata", "get_lesson", "get_lesson_outline", "get_lesson_sources", "list_curriculum_institutions", "list_curriculum_nodes", "list_curriculum_programs", "list_curriculum_versions", "list_folder_contents", "list_folders", "list_lessons", "move_folder", "move_lesson_blocks", "publish_lesson", "restore_lesson_version", "save_lesson_draft", "search_lessons", "set_lesson_lifecycle", "update_lesson_blocks",
    ].sort());
    for (const tool of tools) {
      expect(tool.description?.length).toBeGreaterThan(20);
      expect(typeof tool.annotations?.readOnlyHint).toBe("boolean");
      expect(typeof tool.annotations?.destructiveHint).toBe("boolean");
      expect(typeof tool.annotations?.openWorldHint).toBe("boolean");
      expect(tool._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["openid", "profile", "email"] }]);
      expect(tool.outputSchema).toBeDefined();
    }
    const byName = Object.fromEntries(tools.map((t) => [t.name, t.annotations!]));
    for (const name of ["search_forms", "get_form", "get_results", "list_responses", "list_themes"]) expect(byName[name].readOnlyHint).toBe(true);
    for (const name of ["create_form", "update_form", "publish_form", "set_form_status", "set_form_theme", "set_form_sound"]) expect(byName[name].readOnlyHint).toBe(false);
    expect(byName.update_form.destructiveHint).toBe(true);
    expect(byName.publish_form.openWorldHint).toBe(true);
    for (const name of ["list_games", "get_game"]) expect(byName[name].readOnlyHint).toBe(true);
    expect(byName.create_game_draft).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false });
    expect(byName.host_game).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false });
    for (const name of ["advance_game", "end_game"]) expect(byName[name]).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: true });
  });

  it("asks ChatGPT to connect the account when a tool runs without a token", async () => {
    const client = await connect(null);
    const result = await client.callTool({ name: "search_forms", arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result._meta)).toContain("resource_metadata=");
  });

  it("forwards validated input and returns structured content", async () => {
    const call = vi.fn<McpCaller>(async () => ({
      id: "form_1", kind: "form", title: "Quiz", status: "draft", editUrl: "https://chaos.fail/dashboard/forms/1",
      shareUrl: null, resultsUrl: "https://chaos.fail/dashboard/forms/1/responses", readyToPublish: true, problems: [],
    }));
    const client = await connect(call);
    const result = await client.callTool({ name: "create_form", arguments: {
      title: "Quiz", quizMode: true,
      questions: [{ type: "single_choice", label: "2+2?", options: ["3", "4"], correctAnswers: ["4"] }],
    } });
    expect(result.isError).toBeFalsy();
    expect(call).toHaveBeenCalledWith("create_form", { form: expect.objectContaining({ title: "Quiz", quizMode: true }) });
    expect(result.structuredContent).toMatchObject({ id: "form_1", readyToPublish: true });

    const invalid = await client.callTool({ name: "create_form", arguments: { title: "Q", questions: [{ type: "essay", label: "x" }] } });
    expect(invalid.isError).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("resolves theme names and sends validated theme and sound changes as draft edits", async () => {
    const item = { id: "form_1", kind: "form", title: "T", status: "draft", editUrl: "e", shareUrl: null, resultsUrl: "r", readyToPublish: true, problems: [], theme: {}, warnings: [] };
    const call = vi.fn<McpCaller>(async (tool) => (tool === "list_themes" ? {} : item));
    const client = await connect(call);

    const list = await client.callTool({ name: "list_themes", arguments: {} });
    const catalog = list.structuredContent as { presets: { id: string; name: string }[]; options: { sounds: { id: string }[] } };
    expect(catalog.presets.find((p) => p.id === "chaos")?.name).toBe("Evergreen");
    expect(catalog.options.sounds.map((s) => s.id)).toEqual(["soft", "pop", "wood", "arcade", "off"]);

    for (const name of ["Evergreen", "chaos", "CHAOS", "typeform"]) {
      call.mockClear();
      const result = await client.callTool({ name: "set_form_theme", arguments: { id: "form_1", preset: name, accent: "#112233" } });
      expect(result.isError).toBeFalsy();
      const changes = (call.mock.calls[0][1] as { changes: { theme: Record<string, string> } }).changes.theme;
      expect(changes.preset).toBe(name.toLowerCase() === "typeform" ? "spotlight" : "chaos");
      expect(changes.accent).toBe("#112233");
      expect(changes).not.toHaveProperty("sound");
    }

    call.mockClear();
    expect((await client.callTool({ name: "set_form_theme", arguments: { id: "form_1", preset: "nonsense" } })).isError).toBe(true);
    expect((await client.callTool({ name: "set_form_theme", arguments: { id: "form_1", accent: "red" } })).isError).toBe(true);
    expect((await client.callTool({ name: "set_form_theme", arguments: { id: "form_1", font: "comic" } })).isError).toBe(true);
    expect((await client.callTool({ name: "set_form_theme", arguments: { id: "form_1" } })).isError).toBe(true);
    expect(call).not.toHaveBeenCalled();

    await client.callTool({ name: "set_form_sound", arguments: { id: "form_1", sound: "Glass" } });
    expect(call).toHaveBeenCalledWith("update_form", { id: "form_1", expectedRevision: undefined, changes: { sound: "soft" } });
    expect((await client.callTool({ name: "set_form_sound", arguments: { id: "form_1", sound: "loud" } })).isError).toBe(true);

    call.mockClear();
    await client.callTool({ name: "create_form", arguments: { title: "T", questions: [], theme: "Midnight", sound: "arcade" } });
    const form = (call.mock.calls[0][1] as { form: { theme: { preset: string }; sound: string } }).form;
    expect(form.theme.preset).toBe("midnight");
    expect(form.sound).toBe("arcade");
  });

  it("requires sign-in for the theme tools", async () => {
    const client = await connect(null);
    for (const [name, args] of [["list_themes", {}], ["set_form_theme", { id: "form_1", preset: "paper" }], ["set_form_sound", { id: "form_1", sound: "off" }]] as const) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result._meta)).toContain("resource_metadata=");
    }
  });
});
