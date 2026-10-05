import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTestConvex } from "./setup";
import { defaultFormSettings } from "@/convex/formModel";
import { emptyDefinition } from "@/convex/formLogic";
import { api } from "@/convex/_generated/api";
import type { LessonBlock, LessonDocument } from "@/convex/learnModel";
import { createChaosMcpServer } from "@/lib/mcp/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
const create = makeFunctionReference<"mutation">("mcpLearn:createLesson");
const save = makeFunctionReference<"mutation">("mcpLearn:saveLesson");
const edit = makeFunctionReference<"mutation">("mcpLearn:editBlocks");
const publish = makeFunctionReference<"mutation">("mcpLearn:publishLesson");
const get = makeFunctionReference<"query">("mcpLearn:getLesson");
const list = makeFunctionReference<"query">("mcpLearn:listLessons");
const lifecycle = makeFunctionReference<"mutation">("mcpLearn:lifecycle");
const fork = makeFunctionReference<"mutation">("mcpLearn:forkLesson");
const restore = makeFunctionReference<"mutation">("mcpLearn:restoreLesson");
const sourceMetadata = makeFunctionReference<"query">("mcpLearn:getSourceMetadata");
const stampCreatedWith = makeFunctionReference<"mutation">("mcpLearn:stampCreatedWith");
const userId = "user_learnowner", otherId = "user_learnother";
const metadata = { title: "Pressure", description: "Mechanisms", language: "en", tags: [] };
const block = (id: string, text = id): LessonBlock => ({ id, type: "paragraph", text, citations: [], conceptIds: [] });
const document: LessonDocument = { schemaVersion: 1, blocks: [block("a"), block("b")] };
async function setup() {
  const t = createTestConvex();
  await t.run(async ctx => { for (const clerkId of [userId, otherId]) await ctx.db.insert("users", { clerkId, username: clerkId, email: clerkId + "@example.com", name: clerkId, createdAt: 0, plan: "pro", planExpiresAt: Date.now() + 86400000 }); });
  const { lessonId } = await t.mutation(create, { userId, metadata, document });
  return { t, lessonId };
}
describe("Learn MCP", () => {
  it("labels only the owner's lesson with the assistant that created it, once", async () => {
    const { t, lessonId } = await setup();
    await t.mutation(stampCreatedWith, { userId: otherId, lessonId, createdWith: { client: "claude", name: "Claude" } });
    expect((await t.run(ctx => ctx.db.get("lessons", lessonId)))?.createdWith).toBeUndefined();
    await t.mutation(stampCreatedWith, { userId, lessonId, createdWith: { client: "chatgpt", name: "ChatGPT" } });
    await t.mutation(stampCreatedWith, { userId, lessonId, createdWith: { client: "claude", name: "Claude" } });
    expect((await t.run(ctx => ctx.db.get("lessons", lessonId)))?.createdWith).toEqual({ client: "chatgpt", name: "ChatGPT" });
  });
  it("requires an existing active transport actor and enforces lesson ownership", async () => {
    const { t, lessonId } = await setup();
    await expect(t.mutation(create, { userId: "missing", metadata })).rejects.toThrow("ACCOUNT_REQUIRED");
    await expect(t.query(get, { userId: otherId, lessonId, view: "draft" })).rejects.toThrow("unauthorized");
    await expect(t.mutation(edit, { userId: otherId, lessonId, expectedRevision: 0, operations: [{ action: "delete", blockId: "a" }] })).rejects.toThrow("unauthorized");
    await t.run(async ctx => { const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", userId)).first(); await ctx.db.patch("users", user!._id, { isBanned: true }); });
    await expect(t.query(get, { userId, lessonId, view: "draft" })).rejects.toThrow("ACCOUNT_RESTRICTED");
    await expect(t.mutation(save, { userId, lessonId, expectedRevision: 0, document })).rejects.toThrow("ACCOUNT_RESTRICTED");
  });
  it("edits stable blocks atomically, rejects stale revisions and invalid parent references", async () => {
    const { t, lessonId } = await setup();
    expect(await t.mutation(edit, { userId, lessonId, expectedRevision: 0, operations: [{ action: "append", blocks: [block("c")] }, { action: "update", blockId: "a", block: block("a", "changed") }, { action: "move", blockId: "c", beforeId: "a" }, { action: "delete", blockId: "b" }] })).toEqual({ revision: 1 });
    const draft = await t.query(get, { userId, lessonId, view: "draft", limit: 1 });
    expect(draft.document.blocks.map((b: LessonBlock) => b.id)).toEqual(["c"]); expect(draft.nextOffset).toBe(1);
    await expect(t.mutation(edit, { userId, lessonId, expectedRevision: 0, operations: [{ action: "delete", blockId: "a" }] })).rejects.toThrow("REVISION_CONFLICT");
    await expect(t.mutation(edit, { userId, lessonId, expectedRevision: 1, operations: [{ action: "update", blockId: "a", block: block("renamed") }] })).rejects.toThrow("stable block ID");
    await expect(t.mutation(edit, { userId, lessonId, expectedRevision: 1, operations: [{ action: "append", blocks: [{ ...block("child"), parentId: "missing" }] }, { action: "move", blockId: "a", beforeId: null }] })).rejects.toThrow("VALIDATION");
    expect((await t.query(get, { userId, lessonId, view: "draft" })).revision).toBe(1);
  });
  it("keeps public reads on immutable publication, restores and archives without rewriting versions", async () => {
    const { t, lessonId } = await setup();
    const first = await t.mutation(publish, { userId, lessonId, expectedRevision: 0, visibility: "public" });
    await t.mutation(save, { userId, lessonId, expectedRevision: 1, document: { schemaVersion: 1, blocks: [block("private", "SECRET DRAFT")] }, metadata: { ...metadata, title: "SECRET TITLE" } });
    const publicRead = await t.query(get, { userId: otherId, lessonId, view: "published" });
    expect(publicRead.metadata.title).toBe("Pressure"); expect(publicRead.document).toEqual(document);
    expect(JSON.stringify(await t.query(list, { userId: otherId, scope: "public" }))).not.toContain("SECRET");
    expect((await t.query(get, { userId: otherId, lessonId, view: "outline" })).document).toBeNull();
    await expect(t.query(get, { userId: otherId, lessonId, view: "outline", outlineFrom: "draft" })).rejects.toThrow("unauthorized");
    await t.mutation(restore, { userId, lessonId, versionId: first.versionId, expectedRevision: 2 });
    expect((await t.query(get, { userId, lessonId, view: "draft" })).document).toEqual(document);
    await t.mutation(lifecycle, { userId, lessonId, expectedRevision: 3, action: "archive" });
    await expect(t.query(get, { userId: otherId, lessonId, view: "published" })).rejects.toThrow("unauthorized");
    await t.mutation(lifecycle, { userId, lessonId, expectedRevision: 4, action: "reactivate" });
    expect((await t.query(get, { userId: otherId, lessonId, view: "published" })).versionId).toBe(first.versionId);
    await t.mutation(lifecycle, { userId, lessonId, expectedRevision: 5, action: "unpublish" });
    await expect(t.query(get, { userId: otherId, lessonId, view: "published" })).rejects.toThrow("unauthorized");
  });
  it("forks only an accessible version, preserves provenance and source permission boundaries", async () => {
    const { t, lessonId } = await setup();
    const first = await t.mutation(publish, { userId, lessonId, expectedRevision: 0, visibility: "public" });
    const copy = await t.mutation(fork, { userId: otherId, lessonId, versionId: first.versionId });
    const row = await t.run(ctx => ctx.db.get("lessons", copy.lessonId));
    expect(row).toMatchObject({ ownerId: otherId, parentLessonId: lessonId, parentVersionId: first.versionId, originLessonId: lessonId, visibility: "private", revision: 0 });
    await t.mutation(publish, { userId, lessonId, expectedRevision: 1, visibility: "public" });
    await expect(t.mutation(fork, { userId: otherId, lessonId, versionId: first.versionId })).rejects.toThrow("Version not accessible");
    await expect(t.mutation(restore, { userId: otherId, lessonId: copy.lessonId, versionId: first.versionId, expectedRevision: 0 })).rejects.toThrow("does not belong");
  });
  it("returns metadata only and refuses publication of private or missing image files", async () => {
    const { t, lessonId } = await setup();
    const sourceId = await t.run(ctx => ctx.db.insert("learnSources", { ownerId: userId, uploadedBy: userId, metadata: { title: "Image", kind: "image", origin: "upload" }, metadataVisibility: "public", contentVisibility: "private", createdAt: 0, status: "active", sha256: "hidden" }));
    const source = await t.query(sourceMetadata, { userId: otherId, sourceId });
    expect(source.metadata.title).toBe("Image"); expect(source.storageId).toBeUndefined(); expect(source.sha256).toBeUndefined();
    await t.mutation(save, { userId, lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks: [{ id: "image", type: "image", sourceId, alt: "Image", caption: "", citations: [], conceptIds: [] }] } });
    const failed = await t.mutation(publish, { userId, lessonId, expectedRevision: 1, visibility: "public" });
    expect(failed.ok).toBe(false); expect(failed.problems.map((p: { code: string }) => p.code)).toContain("IMAGE_ACCESS");
    expect((await t.query(get, { userId, lessonId, view: "draft" })).publishedVersionId).toBeNull();
    await t.run(ctx => ctx.db.patch("learnSources", sourceId, { metadataVisibility: "private" }));
    expect(await t.query(sourceMetadata, { userId: otherId, sourceId })).toBeNull();
  });
  it("hides public content when the owner is restricted", async () => {
    const { t, lessonId } = await setup();
    await t.mutation(publish, { userId, lessonId, expectedRevision: 0, visibility: "public" });
    await t.run(async ctx => { const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", userId)).first(); await ctx.db.patch("users", user!._id, { suspendedUntil: 1 }); });
    await expect(t.query(api.lessons.getPublished, { lessonId })).rejects.toThrow("unauthorized");
    expect((await t.query(list, { userId: otherId, scope: "public" })).items).toEqual([]);
  });
  it("registers precise MCP schemas and protects the HTTP envelope actor", async () => {
    const calls: { tool: string; input: Record<string, unknown> }[] = [];
    const server = createChaosMcpServer({ call: async (tool, input) => { calls.push({ tool, input }); return { lessonId: "lesson", revision: 0 }; }, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource" });
    const client = new Client({ name: "test", version: "1" }); const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a); await client.connect(b);
    try {
      const tools = (await client.listTools()).tools;
      for (const name of ["search_lessons", "get_lesson_outline", "get_lesson_sources", "add_lesson_blocks", "update_lesson_blocks", "move_lesson_blocks", "delete_lesson_blocks"]) expect(tools.some(t => t.name === name)).toBe(true);
      const tool = tools.find(t => t.name === "create_lesson")!;
      expect(tool.inputSchema.properties).not.toHaveProperty("userId"); expect(tool.annotations?.readOnlyHint).toBe(false);
      expect(tools.find(t => t.name === "publish_lesson")?.annotations?.openWorldHint).toBe(true);
      await client.callTool({ name: "create_lesson", arguments: { metadata, document } });
      expect(calls).toEqual([
        { tool: "create_lesson", input: { metadata, document } },
        { tool: "publish_lesson", input: { lessonId: "lesson", expectedRevision: 0, visibility: "public" } },
      ]);
    } finally { await client.close(); await server.close(); }
    const { t } = await setup();
    const response = await t.fetch("/api/mcp/v1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, tool: "create_lesson", input: { metadata } }) });
    expect(response.status).toBe(401);
  });
});

describe("Learn MCP transport and publication boundaries", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("uses the envelope actor, validates arguments, and reports bounded revision conflicts", async () => {
    const { t, lessonId } = await setup();
    const secret = "learn-mcp-secret-with-at-least-32-characters";
    vi.stubEnv("CHAOS_MCP_SECRET", secret);
    const send = (tool: string, input: Record<string, unknown>, account = userId) => t.fetch("/api/mcp/v1", { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ userId: account, tool, input }) });
    const created = await send("create_lesson", { metadata, document, userId: otherId });
    expect(created.status).toBe(200);
    const createdBody = await created.json();
    expect(await t.run(ctx => ctx.db.get("lessons", createdBody.result.lessonId))).toMatchObject({ ownerId: userId });
    expect((await send("get_lesson", { lessonId, view: "draft", userId }, otherId)).status).toBe(404);
    const updated = await send("edit_lesson_blocks", { lessonId, expectedRevision: 0, operations: [{ action: "update", blockId: "a", block: block("a", "secret draft") }] });
    expect(updated.status).toBe(200);
    const stale = await send("save_lesson_draft", { lessonId, expectedRevision: 0, document });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: { code: "REVISION_CONFLICT", message: "The lesson changed; reload before editing.", details: { currentRevision: 1 } } });
    expect((await send("get_lesson", { lessonId, view: "draft", limit: "100" })).status).toBe(400);
    expect((await send("publish_lesson", { lessonId, expectedRevision: 1, visibility: "public" })).status).toBe(200);
    expect((await send("get_lesson", { lessonId, view: "published" }, otherId)).status).toBe(200);
    expect((await send("search_lessons", { scope: "public", limit: 1 })).status).toBe(200);
    expect((await send("get_lesson_outline", { lessonId }, otherId)).status).toBe(200);
    expect((await send("get_lesson_sources", { lessonId, view: "published" }, otherId)).status).toBe(200);
    expect((await send("restore_lesson_version", { lessonId, expectedRevision: 2, versionId: createdBody.result.lessonId })).status).toBe(400);
  });
  it("publishes a real public image, then refuses a missing blob and never returns storage IDs", async () => {
    const { t, lessonId } = await setup();
    const { storageId, sourceId } = await t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob(["image"], { type: "image/png" }));
      const sourceId = await ctx.db.insert("learnSources", { ownerId: userId, uploadedBy: userId, metadata: { title: "Image", kind: "image", origin: "upload" }, metadataVisibility: "public", contentVisibility: "public", createdAt: 0, status: "active", storageId });
      return { storageId, sourceId };
    });
    const image: LessonBlock = { id: "image", type: "image", sourceId, alt: "Pressure diagram", caption: "", citations: [], conceptIds: [] };
    await t.mutation(save, { userId, lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks: [image] } });
    expect((await t.mutation(publish, { userId, lessonId, expectedRevision: 1, visibility: "public" })).ok).toBe(true);
    expect(JSON.stringify(await t.query(sourceMetadata, { userId: otherId, sourceId }))).not.toContain(storageId);
    await t.run(ctx => ctx.storage.delete(storageId));
    const failed = await t.mutation(publish, { userId, lessonId, expectedRevision: 2, visibility: "public" });
    expect(failed.ok).toBe(false); expect(failed.problems.map((p: { code: string }) => p.code)).toContain("MISSING_FILE");
  });
  it("requires a quiz-enabled owned active unbanned published form", async () => {
    const { t, lessonId } = await setup();
    const { formId, versionId } = await t.run(async ctx => {
      const definition = emptyDefinition();
      const formId = await ctx.db.insert("forms", { ownerId: userId, title: "Assessment", shareId: "assessment", status: "live", draft: definition, draftRevision: 0, settings: defaultFormSettings, publishedVersion: 1, responseCount: 0, partialCount: 0, createdAt: 0, updatedAt: 0 });
      const versionId = await ctx.db.insert("formVersions", { formId, version: 1, definition, publishedAt: 0, publishedBy: userId, draftRevision: 0 });
      return { formId, versionId };
    });
    await t.mutation(save, { userId, lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks: [{ id: "quiz", type: "quiz", asset: { kind: "form", id: formId }, citations: [], conceptIds: [] }] } });
    expect((await t.mutation(publish, { userId, lessonId, expectedRevision: 1, visibility: "public" })).ok).toBe(false);
    await t.run(async ctx => { const version = await ctx.db.get("formVersions", versionId); await ctx.db.patch("formVersions", versionId, { definition: { ...version!.definition, quiz: { enabled: true } } }); });
    expect((await t.mutation(publish, { userId, lessonId, expectedRevision: 1, visibility: "public" })).ok).toBe(true);
    await t.run(ctx => ctx.db.patch("forms", formId, { isBanned: true }));
    expect((await t.mutation(publish, { userId, lessonId, expectedRevision: 2, visibility: "public" })).ok).toBe(false);
  });
  it("resolves curriculum slugs to stable IDs, supports concept-only coverage and freezes mappings and visibility", async () => {
    const { t, lessonId } = await setup();
    const { conceptId, mappingId } = await t.run(async ctx => {
      const institutionId = await ctx.db.insert("curriculumInstitutions", { key: "school", name: "School" });
      const programId = await ctx.db.insert("curriculumPrograms", { institutionId, key: "course", name: "Course" });
      const versionId = await ctx.db.insert("curriculumVersions", { programId, key: "v1", name: "V1" });
      const nodeId = await ctx.db.insert("curriculumNodes", { versionId, parentId: null, key: "pressure", name: "Pressure", kind: "subject", conceptKeys: ["pressure"] });
      const conceptId = await ctx.db.insert("learnConcepts", { slug: "pressure", title: "Pressure", description: "", createdBy: userId });
      const mappingId = await ctx.db.insert("lessonCurriculumMappings", { lessonId, nodeId, versionId, conceptKeys: ["pressure"], blockIds: [] });
      return { conceptId, mappingId };
    });
    await t.mutation(save, { userId, lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks: [{ ...block("a"), conceptIds: [conceptId] }] } });
    const first = await t.mutation(publish, { userId, lessonId, expectedRevision: 1, visibility: "public" }); expect(first.ok).toBe(true);
    const snapshot = await t.run(ctx => ctx.db.get("lessonVersions", first.versionId));
    expect(snapshot?.visibility).toBe("public"); expect(snapshot?.curriculumMappings?.[0].blockIds).toEqual([]);
    expect(snapshot?.curriculumMappings?.[0]).not.toHaveProperty("lessonId");
    await t.run(ctx => ctx.db.patch("lessonCurriculumMappings", mappingId, { blockIds: ["missing"] }));
    expect((await t.mutation(publish, { userId, lessonId, expectedRevision: 2, visibility: "public" })).ok).toBe(false);
    expect(await t.run(ctx => ctx.db.get("lessonVersions", first.versionId))).toEqual(snapshot);
    await t.mutation(save, { userId, lessonId, expectedRevision: 2, document: { schemaVersion: 1, blocks: [{ ...block("a"), conceptIds: ["pressure"] }] } });
    const failed = await t.mutation(publish, { userId, lessonId, expectedRevision: 3, visibility: "public" });
    expect(failed.problems.map((p: { code: string }) => p.code)).toContain("UNKNOWN_CONCEPT");
  });
  it("finds owned unpublished draft metadata without exposing it to public search", async () => {
    const { t, lessonId } = await setup();
    expect((await t.query(list, { userId, scope: "owned", query: "Pressure" })).items.map((x: { lessonId: string }) => x.lessonId)).toContain(lessonId);
    expect((await t.query(list, { userId: otherId, scope: "public", query: "Pressure" })).items).toEqual([]);
  });
});

describe("Learn roadmap tools", () => {
  it("supports each block alias using the same revision-protected service", async () => {
    const { t, lessonId } = await setup();
    const add = makeFunctionReference<"mutation">("mcpLearn:addBlocks"), update = makeFunctionReference<"mutation">("mcpLearn:updateBlocks"), move = makeFunctionReference<"mutation">("mcpLearn:moveBlocks"), remove = makeFunctionReference<"mutation">("mcpLearn:deleteBlocks");
    expect(await t.mutation(add, { userId, lessonId, expectedRevision: 0, blocks: [block("c")] })).toEqual({ revision: 1 });
    await expect(t.mutation(update, { userId, lessonId, expectedRevision: 0, blocks: [block("a", "changed")] })).rejects.toThrow("REVISION_CONFLICT");
    await t.mutation(update, { userId, lessonId, expectedRevision: 1, blocks: [block("a", "changed")] });
    await t.mutation(move, { userId, lessonId, expectedRevision: 2, moves: [{ blockId: "c", beforeId: "a" }] });
    await t.mutation(remove, { userId, lessonId, expectedRevision: 3, blockIds: ["b"] });
    const draft = await t.query(get, { userId, lessonId, view: "draft" });
    expect(draft.document.blocks.map((b: LessonBlock) => b.id)).toEqual(["c", "a"]);
    expect(draft.document.blocks[1].text).toBe("changed"); expect(draft.publishedVersionId).toBeNull();
  });
  it("gathers only independently accessible sources from the selected snapshot", async () => {
    const { t, lessonId } = await setup();
    const ids = await t.run(async ctx => {
      const base = { ownerId: userId, uploadedBy: userId, metadata: { title: "Source", kind: "reference" as const, origin: "Book" }, metadataVisibility: "public" as const, contentVisibility: "private" as const, createdAt: 0, status: "active" as const };
      return [await ctx.db.insert("learnSources", base), await ctx.db.insert("learnSources", { ...base, metadata: { ...base.metadata, title: "Uncited" } }), await ctx.db.insert("learnSources", { ...base, metadata: { ...base.metadata, title: "Private cited" }, metadataVisibility: "private" })];
    });
    const doc: LessonDocument = { schemaVersion: 1, blocks: [{ ...block("a"), citations: [{ sourceId: ids[0], locator: { kind: "section", label: "Intro" } }] }] };
    await t.mutation(save, { userId, lessonId, expectedRevision: 0, document: doc });
    await t.mutation(publish, { userId, lessonId, expectedRevision: 1, visibility: "public" });
    await t.mutation(save, { userId, lessonId, expectedRevision: 2, document: { schemaVersion: 1, blocks: [{ ...block("new"), citations: [{ sourceId: ids[2], locator: { kind: "page", page: 1 } }] }] } });
    const sources = makeFunctionReference<"query">("mcpLearn:getLessonSources");
    expect((await t.query(sources, { userId: otherId, lessonId, view: "published" })).sources.map((s: { sourceId: string }) => s.sourceId)).toEqual([ids[0]]);
    await expect(t.query(sources, { userId: otherId, lessonId, view: "draft" })).rejects.toThrow("unauthorized");
    expect((await t.query(sources, { userId, lessonId, view: "draft" })).sources.map((s: { sourceId: string }) => s.sourceId)).toEqual([ids[2]]);
    await t.run(ctx => ctx.db.patch("learnSources", ids[0], { metadataVisibility: "private" }));
    expect((await t.query(sources, { userId: otherId, lessonId, view: "published" })).sources).toEqual([]);
    const outline = await t.query(makeFunctionReference<"query">("mcpLearn:getLessonOutline"), { userId: otherId, lessonId });
    expect(outline.outline.map((b: { id: string }) => b.id)).toEqual(["a"]); expect(outline.document).toBeNull();
  });
});

it("inspects immutable history with bounded reads and hides historical private material", async () => {
  const { t, lessonId } = await setup();
  const first = await t.mutation(publish, { userId, lessonId, expectedRevision: 0, visibility: "private" });
  await t.mutation(save, { userId, lessonId, expectedRevision: 1, document: { schemaVersion: 1, blocks: [block("a", "Public")] } });
  await t.mutation(publish, { userId, lessonId, expectedRevision: 2, visibility: "public" });
  const versions = makeFunctionReference<"query">("mcpLearn:listLessonVersions");
  const version = makeFunctionReference<"query">("mcpLearn:getLessonVersion");
  const history = await t.query(versions, { userId, lessonId, limit: 1 });
  expect(history.versions).toHaveLength(1);
  expect(history.nextBeforeNumber).toBe(2);
  expect((await t.query(version, { userId, lessonId, versionId: first.versionId, limit: 1 })).nextOffset).toBe(1);
  await expect(t.query(version, { userId: otherId, lessonId, versionId: first.versionId })).rejects.toThrow("Version not accessible");
  await expect(t.query(versions, { userId: otherId, lessonId })).rejects.toThrow("unauthorized");
  expect(await t.query(makeFunctionReference<"query">("mcpLearn:getCapabilities"), { userId })).toMatchObject({ schemaVersion: 1, limits: { folderDepth: 8, fileBytes: 26214400 } });
});

it("links quizzes idempotently and reuses normal Live eligibility", async () => {
  const { t, lessonId } = await setup();
  const formId = await t.run(async ctx => {
    const definition = { ...emptyDefinition("Assessment"), quiz: { enabled: true } };
    const id = await ctx.db.insert("forms", { ownerId: userId, title: "Assessment", shareId: "linked", status: "live", draft: definition, draftRevision: 0, settings: defaultFormSettings, publishedVersion: 1, responseCount: 0, partialCount: 0, createdAt: 0, updatedAt: 0 });
    await ctx.db.insert("formVersions", { formId: id, version: 1, definition, publishedAt: 0, publishedBy: userId, draftRevision: 0 });
    return id;
  });
  const asset = { kind: "form", id: formId };
  const attach = makeFunctionReference<"mutation">("mcpAssessments:attach"), live = makeFunctionReference<"mutation">("mcpAssessments:createLive");
  await expect(t.mutation(live, { userId, lessonId, asset })).rejects.toThrow("attach_lesson_quiz first");
  await expect(t.mutation(attach, { userId: otherId, lessonId, asset, label: "Quiz", order: 0 })).rejects.toThrow("unauthorized");
  const link = await t.mutation(attach, { userId, lessonId, asset, label: "Quiz", order: 0 });
  expect(await t.mutation(attach, { userId, lessonId, asset, label: "Quiz renamed", order: 1 })).toEqual(link);
  // Assistants often call a create_form quiz kind "quiz"; the form ID still resolves to the same link.
  expect(await t.mutation(attach, { userId, lessonId, asset: { kind: "quiz", id: formId }, label: "Quiz", order: 1 })).toEqual(link);
  await expect(t.mutation(attach, { userId, lessonId, asset: { kind: "quiz", id: "not-an-id" }, label: "Quiz", order: 1 })).rejects.toThrow("NOT_FOUND");
  await expect(t.mutation(live, { userId, lessonId, asset })).rejects.toThrow("LIVE_NO_QUESTIONS");
  await t.run(async ctx => {
    const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", q => q.eq("formId", formId).eq("version", 1)).unique();
    await ctx.db.patch("formVersions", version!._id, { definition: { ...version!.definition, fields: [{ id: "q", type: "choice", label: "Choose", required: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], quiz: { correctOptionIds: ["a"], points: 1 } }] } });
  });
  const room = await t.mutation(live, { userId, lessonId, asset });
  expect(await t.run(ctx => ctx.db.get("liveGames", room.gameId))).toMatchObject({ formId, state: "lobby" });
});
