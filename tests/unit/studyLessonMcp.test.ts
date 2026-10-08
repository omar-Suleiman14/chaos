import { expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer } from "@/lib/mcp/server";
import {
  readStudySkillFiles,
  studySkillPaths,
} from "@/lib/integrations/studySkill";
import { integrationPackage } from "@/lib/integrations/packages";
const metadataUrl =
  "https://chaos.fail/.well-known/oauth-protected-resource/mcp";
async function connect(
  call: Parameters<typeof createChaosMcpServer>[0]["call"],
  permissions?: Parameters<typeof createChaosMcpServer>[0]["permissions"],
) {
  const server = createChaosMcpServer({
    call,
    resourceMetadataUrl: metadataUrl,
    permissions,
  });
  const client = new Client({ name: "study-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return {
    server,
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}
it("ships the canonical skill and references in both plugin packages and through generic MCP resources/prompts", async () => {
  const files = await readStudySkillFiles();
  const logo = {
    svg: "<svg/>",
    png512: new Uint8Array(),
    png128: new Uint8Array(),
  };
  for (const platform of ["claude", "chatgpt"] as const) {
    const archive = integrationPackage(platform, logo, files);
    const portable = JSON.parse(archive["plugin.json"] as string);
    expect(portable.name).toBe("chaos");
    expect(
      portable.extensions["com.openai"].interface.shortDescription.length,
    ).toBeLessThanOrEqual(30);
    expect(portable).not.toHaveProperty("skills");
    expect(
      JSON.parse(archive["mcp.json"] as string).mcpServers.chaos,
    ).toMatchObject({ type: "streamable-http", url: "https://chaos.fail/mcp" });
    for (const [key, text] of Object.entries(files))
      expect(archive[key]).toBe(text);
  }
  const c = await connect(null);
  try {
    const resources = await c.client.listResources();
    expect(
      resources.resources.filter((r) => r.uri.startsWith("chaos://skills/"))
        .length,
    ).toBe(3);
    for (const path of studySkillPaths) {
      const data = await c.client.readResource({
        uri: `chaos://skills/create-study-lesson/${path}`,
      });
      expect(data.contents[0]).toMatchObject({
        text: files[`skills/create-study-lesson/${path}`],
      });
    }
    const prompt = await c.client.getPrompt({ name: "create-study-lesson" });
    expect(prompt.messages[0].content).toMatchObject({
      type: "text",
      text: files["skills/create-study-lesson/SKILL.md"],
    });
  } finally {
    await c.close();
  }
});
it("registers the resumable workflow, resolves existing themes and forwards validated requests", async () => {
  const call = vi.fn(async () => ({
    jobId: "job",
    status: "collecting",
    revision: 0,
    nextAction: "Read sources",
    lessonId: null,
    lessonUrl: null,
    assets: [],
    problems: [],
    profile: {},
    request: {},
    summary: {
      assets: 0,
      checkpoints: 0,
      flashcardSets: 0,
      sections: 0,
      questions: 0,
      cards: 0,
      glossaryTerms: 0,
      media: 0,
      sources: 1,
    },
    progress: {
      stage: "source_access",
      savedCheckpoints: 0,
      checkpointBytes: 0,
    },
    resolvedCourseId: null,
    resolvedModuleId: null,
  }));
  const c = await connect(call);
  try {
    const { tools } = await c.client.listTools();
    for (const name of [
      "build_study_lesson",
      "checkpoint_study_lesson",
      "finalize_study_lesson",
      "get_study_source_content",
      "publish_study_lesson",
    ])
      expect(tools.some((t) => t.name === name)).toBe(true);
    const response = await c.client.callTool({
      name: "build_study_lesson",
      arguments: {
        request: {
          key: "lecture",
          title: "Lecture",
          sources: [
            { reference: "https://example.org/lecture", label: "Lecture" },
          ],
          preferences: { theme: "Paper", sound: "off" },
        },
      },
    });
    expect(response.isError).not.toBe(true);
    expect(call).toHaveBeenCalledWith(
      "build_study_lesson",
      expect.objectContaining({
        request: expect.objectContaining({
          preferences: expect.objectContaining({
            themeDesign: expect.objectContaining({
              preset: "paper",
              sound: "off",
            }),
          }),
        }),
      }),
    );
  } finally {
    await c.close();
  }
});
it("never bypasses publication permission with high-level jobs", async () => {
  const call = vi.fn(async () => ({ status: "published" }));
  const c = await connect(call, ["read_content", "edit_content"]);
  try {
    const response = await c.client.callTool({
      name: "publish_study_lesson",
      arguments: { jobId: "job", expectedRevision: 0 },
    });
    expect(response.isError).toBe(true);
    const reference = await c.client.callTool({
      name: "register_study_reference",
      arguments: {
        metadata: { title: "Lecture", kind: "url", origin: "https://example.org/lecture", url: "https://example.org/lecture" },
        metadataVisibility: "public",
      },
    });
    expect(reference.isError).toBe(true);
    expect(call).not.toHaveBeenCalled();
  } finally {
    await c.close();
  }
});
