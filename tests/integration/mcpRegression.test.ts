import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer } from "@/lib/mcp/server";
import type { McpPermission } from "@/lib/mcp/permissions";
import inventory from "@/lib/mcp/inventory.json";
import { createTestConvex } from "./setup";
import { lessonMeta, perfCreator, perfStudent, PERF_EPOCH, signIn, type T } from "@/perf/lib/fixtures";
import { connectMcp, convexMcpCaller } from "@/perf/lib/mcp";

/**
 * The MCP surface end to end: the real MCP server (lib/mcp/server.ts) calling the real Convex
 * HTTP action (/api/mcp/v1) of an in-memory convex-test deployment, as app/mcp/route.ts does.
 * Covers tool listing, auth, and each lifecycle step an assistant takes: create, update,
 * publish, attach, archive and course/module operations.
 */
afterEach(() => vi.unstubAllEnvs());

type Mcp = Awaited<ReturnType<typeof connectMcp>>;
type Result = Awaited<ReturnType<Mcp["callTool"]>>;
const text = (result: Result) => (result.content as { type: string; text: string }[])[0]?.text ?? "";
const errorOf = (result: Result) => (result._meta as { "chaos/error"?: { code: string; category: string } } | undefined)?.["chaos/error"];

async function setup() {
  vi.setSystemTime(PERF_EPOCH);
  const t = createTestConvex();
  await signIn(t, perfCreator, "perry");
  const mcp = await connectMcp(convexMcpCaller(t, perfCreator.subject));
  /** Calls a tool and returns its structured result, failing with the tool's own error text. */
  const call = async <R = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}) => {
    const result = await mcp.callTool({ name, arguments: args });
    expect(result.isError, `${name}: ${text(result)}`).toBeFalsy();
    return result.structuredContent as R;
  };
  return { t, mcp, call };
}

const paragraph = (id: string, body: string) => ({ id, type: "paragraph", text: body, citations: [], conceptIds: [] });
const quizForm = { title: "Checkpoint", quizMode: true, publish: true, questions: [{ type: "single_choice", label: "Largest planet?", options: ["Mars", "Jupiter"], correctAnswers: ["Jupiter"] }] };

async function connectWith(t: T, permissions: readonly McpPermission[]) {
  const server = createChaosMcpServer({ call: convexMcpCaller(t, perfCreator.subject), permissions, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
  const client = new Client({ name: "chaos-regression", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("MCP regression", { timeout: 30_000 }, () => {
  it("lists exactly the inventoried tools, each described, typed and permission-tagged", async () => {
    const { tools } = await (await connectMcp(null)).listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(inventory.names);
    expect(tools).toHaveLength(inventory.count);
    for (const tool of tools) {
      expect(tool.description?.length, tool.name).toBeGreaterThan(20);
      expect(tool.inputSchema.type, tool.name).toBe("object");
      expect((tool._meta as Record<string, unknown>)["chaos/permission"], tool.name).toBeTruthy();
    }
    const admin = (await (await connectMcp(null, true)).listTools()).tools.map((tool) => tool.name);
    expect(admin.filter((name) => !inventory.names.includes(name)).sort()).toEqual(inventory.administratorNames);
  });

  describe("auth", () => {
    it("asks an unconnected client to sign in instead of running the tool", async () => {
      const result = await (await connectMcp(null)).callTool({ name: "list_lessons", arguments: { scope: "owned" } });
      expect(result.isError).toBe(true);
      expect(text(result)).toMatch(/Connect your Chaos account/);
      expect(JSON.stringify(result._meta)).toContain("resource_metadata");
    });

    it("refuses the backend endpoint without the shared secret, and accounts that never signed in", async () => {
      const { t } = await setup();
      const response = await t.fetch("/api/mcp/v1", { method: "POST", headers: { Authorization: "Bearer wrong-secret-0123456789abcdef0123456789", "Content-Type": "application/json" }, body: JSON.stringify({ userId: perfCreator.subject, tool: "list_lessons", input: { scope: "owned" } }) });
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");

      const stranger = await connectMcp(convexMcpCaller(t, "user_neversignedin"));
      const result = await stranger.callTool({ name: "list_lessons", arguments: { scope: "owned" } });
      expect(errorOf(result)).toMatchObject({ code: "ACCOUNT_REQUIRED", category: "auth" });
    });

    it("enforces the connection's permission grant before calling Chaos", async () => {
      const { t } = await setup();
      const readOnly = await connectWith(t, ["read_content"]);
      expect((await readOnly.callTool({ name: "list_lessons", arguments: { scope: "owned" } })).isError).toBeFalsy();
      const denied = await readOnly.callTool({ name: "create_lesson", arguments: { metadata: lessonMeta("Nope") } });
      expect(errorOf(denied)).toMatchObject({ code: "PERMISSION_DENIED", category: "permission" });
      expect(await t.run((ctx) => ctx.db.query("lessons").collect())).toHaveLength(0);
    });

    it("takes the acting account from the trusted envelope, never from tool input", async () => {
      const { t, call } = await setup();
      await signIn(t, perfStudent);
      const { lessonId } = await call<{ lessonId: string }>("create_lesson", { metadata: lessonMeta("Mine"), userId: perfStudent.subject, ownerId: perfStudent.subject });
      const row = await t.run((ctx) => ctx.db.query("lessons").collect());
      expect(row.find((lesson) => lesson._id === lessonId)?.ownerId).toBe(perfCreator.subject);
    });
  });

  it("creates, updates, publishes, attaches and archives a lesson", async () => {
    const { t, call } = await setup();
    const form = await call<{ id: string; status: string; shareUrl: string }>("create_form", quizForm);
    expect(form.status).toBe("live");

    const { lessonId } = await call<{ lessonId: string }>("create_lesson", { metadata: lessonMeta("Blood pressure"), document: { schemaVersion: 1, blocks: [paragraph("p1", "First draft")] }, publish: false });
    let draft = await call<{ revision: number; document: { blocks: { text?: string }[] }; publishedVersionId: string | null }>("get_lesson", { lessonId, view: "draft" });
    expect(draft.publishedVersionId).toBeNull();

    const added = await call<{ revision: number }>("add_lesson_blocks", { lessonId, expectedRevision: draft.revision, blocks: [paragraph("p2", "Second paragraph")] });
    const updated = await call<{ revision: number }>("update_lesson_blocks", { lessonId, expectedRevision: added.revision, blocks: [paragraph("p1", "Revised")] });
    draft = await call("get_lesson", { lessonId, view: "draft" });
    expect(draft.revision).toBe(updated.revision);
    expect(draft.document.blocks.map((block) => block.text)).toEqual(["Revised", "Second paragraph"]);

    const published = await call<{ ok: boolean; versionId: string; revision: number }>("publish_lesson", { lessonId, expectedRevision: draft.revision, visibility: "public" });
    expect(published.ok).toBe(true);
    const live = await call<{ document: { blocks: { text?: string }[] } }>("get_lesson", { lessonId, view: "published" });
    expect(live.document.blocks[0].text).toBe("Revised");

    await call("attach_lesson_quiz", { lessonId, asset: { kind: "form", id: form.id }, label: "Checkpoint", order: 0 });
    const quizzes = await call<{ quizzes?: unknown[]; items?: unknown[] }>("get_lesson_quizzes", { lessonId });
    expect(JSON.stringify(quizzes)).toContain("Checkpoint");
    const deck = await call<{ setId: string; versionId: string; published: boolean }>("create_flashcard_set", { title: "Receptors", cards: [{ id: "c1", front: "α1", back: "Constriction" }], publish: true, visibility: "public" });
    expect(deck.published).toBe(true);
    await call("attach_lesson_flashcards", { lessonId, versionId: deck.versionId, label: "Receptors", order: 1 });
    expect(JSON.stringify(await call("get_lesson_flashcards", { lessonId }))).toContain("Receptors");

    const before = await call<{ revision: number }>("get_lesson", { lessonId, view: "draft" });
    await call("set_lesson_lifecycle", { lessonId, expectedRevision: before.revision, action: "archive" });
    expect((await t.run((ctx) => ctx.db.query("lessons").collect())).find((lesson) => lesson._id === lessonId)?.status).toBe("archived");
    // The owner still finds it, marked archived, so it can be reactivated.
    const listed = await call<{ items: { lessonId: string; status: string }[] }>("list_lessons", { scope: "owned" });
    expect(listed.items.find((lesson) => lesson.lessonId === lessonId)?.status).toBe("archived");
  });

  it("builds a course with modules, publishes, unpublishes and archives it", async () => {
    const { call } = await setup();
    const form = await call<{ id: string }>("create_form", quizForm);
    const { courseId } = await call<{ courseId: string }>("create_course", { title: "Central nervous system" });
    const lessons: string[] = [];
    for (const title of ["Meninges", "Ventricles", "Action potentials"]) {
      const { lessonId } = await call<{ lessonId: string }>("add_course_lesson", { courseId, title });
      await call("save_lesson_draft", { lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks: [paragraph("p", `${title} notes`)] } });
      lessons.push(lessonId);
    }
    await call("set_course_modules", { courseId, modules: [
      { id: "anatomy", title: "Anatomy", lessonIds: lessons.slice(0, 2), assessments: [] },
      { id: "physiology", title: "Physiology", lessonIds: lessons.slice(2), assessments: [{ kind: "form", id: form.id }] },
    ] });
    let course = await call<{ modules: { title: string; lessonIds?: string[]; lessons?: unknown[] }[]; published: boolean }>("get_course", { courseId });
    expect(course.modules.map((module) => module.title)).toEqual(["Anatomy", "Physiology"]);

    const published = await call<{ ok: boolean }>("publish_course", { courseId, visibility: "public" });
    expect(published.ok).toBe(true);
    course = await call("get_course", { courseId });
    expect(course.published).toBe(true);

    await call("unpublish_course", { courseId });
    expect((await call<{ published: boolean }>("get_course", { courseId })).published).toBe(false);
    await call("set_course_archived", { courseId, archived: true });
    const { courses } = await call<{ courses: { id: string; archived: boolean }[] }>("list_courses", {});
    expect(courses.find((c) => c.id === courseId)?.archived).toBe(true);
  });

  it("accepts the form ids its own tools return in every form tool", async () => {
    const { call } = await setup();
    const form = await call<{ id: string }>("create_form", { title: "Sign-up", questions: [{ type: "short_text", label: "Name?" }] });
    expect(form.id).toMatch(/^form_/);
    const controls = await call<{ settingsRevision: number }>("get_form_response_controls", { formId: form.id });
    const saved = await call<{ settingsRevision: number }>("set_form_response_controls", { formId: form.id, expectedSettingsRevision: controls.settingsRevision, patch: { responseLimit: 10 } });
    expect(saved.settingsRevision).toBe(controls.settingsRevision + 1);
    await call("list_form_collaborators", { formId: form.id });
  });

  it("reports unpublishable courses as problems, not as a failure", async () => {
    const { call } = await setup();
    const { courseId } = await call<{ courseId: string }>("create_course", { title: "Empty course" });
    await call("add_course_lesson", { courseId, title: "No material yet" });
    const result = await call<{ ok: boolean; problems: { message: string }[] }>("publish_course", { courseId, visibility: "public" });
    expect(result.ok).toBe(false);
    expect(result.problems[0].message).toMatch(/Add material/);
  });
});
