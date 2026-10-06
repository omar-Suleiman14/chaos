import { expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer } from "@/lib/mcp/server";
import { createTestConvex } from "./setup";

it("advertises bounded organization reads, validates outputs and strips tool actor input", async () => {
  const call = vi.fn(async (tool: string) =>
    tool === "search_curriculum_modules"
      ? { modules: [] }
      : { page: [], isDone: true, continueCursor: "" },
  );
  const server = createChaosMcpServer({
    call,
    resourceMetadataUrl:
      "https://chaos.fail/.well-known/oauth-protected-resource/mcp",
  });
  const client = new Client({ name: "organization-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  try {
    const { tools } = await client.listTools();
    for (const name of [
      "list_lesson_curriculum_mappings",
      "search_curriculum_modules",
    ]) {
      const descriptor = tools.find((tool) => tool.name === name)!;
      expect(descriptor.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(descriptor.inputSchema.properties).not.toHaveProperty("userId");
      expect(descriptor.outputSchema).toBeDefined();
      expect(descriptor._meta?.securitySchemes).toEqual([
        { type: "oauth2", scopes: ["openid", "profile", "email", "offline_access"] },
      ]);
    }
    const mappingInput = {
      lessonId: "lesson",
      paginationOpts: { numItems: 1, cursor: null },
    };
    const mappings = await client.callTool({
      name: "list_lesson_curriculum_mappings",
      arguments: { ...mappingInput, userId: "spoof" },
    });
    expect(mappings.isError).toBeFalsy();
    expect(mappings.structuredContent).toEqual({
      page: [],
      isDone: true,
      continueCursor: "",
    });
    expect(call).toHaveBeenLastCalledWith(
      "list_lesson_curriculum_mappings",
      mappingInput,
    );
    const searchInput = { versionId: "version", query: "Heart", limit: 1 };
    const modules = await client.callTool({
      name: "search_curriculum_modules",
      arguments: { ...searchInput, userId: "spoof" },
    });
    expect(modules.isError).toBeFalsy();
    expect(modules.structuredContent).toEqual({ modules: [] });
    expect(call).toHaveBeenLastCalledWith(
      "search_curriculum_modules",
      searchInput,
    );
    call.mockClear();
    expect(
      (
        await client.callTool({
          name: "search_curriculum_modules",
          arguments: { ...searchInput, limit: 51 },
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await client.callTool({
          name: "list_lesson_curriculum_mappings",
          arguments: {
            ...mappingInput,
            paginationOpts: { numItems: 51, cursor: null },
          },
        })
      ).isError,
    ).toBe(true);
    expect(call).not.toHaveBeenCalled();
  } finally {
    await client.close();
    await server.close();
  }
});

it("routes real HTTP organization reads using the secret-protected actor envelope", async () => {
  const t = createTestConvex(),
    owner = "user_orgowner",
    other = "user_orgother";
  await t.run(async (ctx) => {
    for (const clerkId of [owner, other])
      await ctx.db.insert("users", {
        clerkId,
        username: clerkId,
        name: clerkId,
        email: `${clerkId}@example.com`,
        createdAt: 0,
      });
  });
  const lessonId = (
    await t.mutation(
      makeFunctionReference<"mutation">("mcpLearn:createLesson"),
      {
        userId: owner,
        metadata: {
          title: "Private lesson",
          description: "",
          language: "en",
          tags: [],
        },
      },
    )
  ).lessonId;
  const ids = await t.run(async (ctx) => {
    const institutionId = await ctx.db.insert("curriculumInstitutions", {
      key: "school",
      name: "School",
    });
    const programId = await ctx.db.insert("curriculumPrograms", {
      institutionId,
      key: "medicine",
      name: "Medicine",
    });
    const versionId = await ctx.db.insert("curriculumVersions", {
      programId,
      key: "v1",
      name: "One",
    });
    const nodeId = await ctx.db.insert("curriculumNodes", {
      versionId,
      parentId: null,
      key: "heart",
      name: "Heart Physiology",
      kind: "module",
      conceptKeys: ["heart"],
    });
    await ctx.db.insert("lessonCurriculumMappings", {
      lessonId,
      versionId,
      nodeId,
      conceptKeys: ["heart"],
      blockIds: [],
    });
    return { versionId, nodeId };
  });
  const secret = "organization-test-secret-at-least-32-chars";
  vi.stubEnv("CHAOS_MCP_SECRET", secret);
  const invoke = (
    userId: string,
    tool: string,
    input: Record<string, unknown>,
    credential = secret,
  ) =>
    t.fetch("/api/mcp/v1", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, tool, input }),
    });
  try {
    const mappings = await invoke(owner, "list_lesson_curriculum_mappings", {
      lessonId,
      paginationOpts: { numItems: 1, cursor: null },
      userId: other,
    });
    expect(mappings.status).toBe(200);
    expect((await mappings.json()).result.page[0]).toMatchObject({
      lessonId,
      nodeId: ids.nodeId,
      conceptKeys: ["heart"],
    });
    const modules = await invoke(owner, "search_curriculum_modules", {
      versionId: ids.versionId,
      query: "Heart",
      limit: 1,
      userId: "user_missing",
    });
    expect(modules.status).toBe(200);
    expect((await modules.json()).result.modules[0]._id).toBe(ids.nodeId);
    expect(
      (
        await invoke(other, "list_lesson_curriculum_mappings", {
          lessonId,
          paginationOpts: { numItems: 1, cursor: null },
          userId: owner,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await invoke(
          owner,
          "search_curriculum_modules",
          { versionId: ids.versionId, query: "Heart" },
          "invalid",
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await invoke(owner, "search_curriculum_modules", {
          versionId: ids.versionId,
          query: "Heart",
          limit: 51,
        })
      ).status,
    ).toBe(400);
  } finally {
    vi.unstubAllEnvs();
  }
});
