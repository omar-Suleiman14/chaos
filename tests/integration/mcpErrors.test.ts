import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestConvex } from "./setup";
import { lessonMeta, perfCreator, perfStudent, PERF_EPOCH, signIn } from "@/perf/lib/fixtures";
import { connectMcp, convexMcpCaller } from "@/perf/lib/mcp";

/**
 * Tool errors must say what kind of failure happened so a person or an assistant can recover:
 * fix the arguments, ask for access, reload and retry, or finish the content first. Each case
 * runs through the real MCP server and Convex endpoint, and none may come back as an internal
 * "something went wrong".
 */
afterEach(() => vi.unstubAllEnvs());

type Mcp = Awaited<ReturnType<typeof connectMcp>>;
type Result = Awaited<ReturnType<Mcp["callTool"]>>;
type ChaosError = { code: string; category: string; retryable: boolean; details?: Record<string, unknown> };
const text = (result: Result) => (result.content as { type: string; text: string }[])[0]?.text ?? "";
const errorOf = (result: Result) => (result._meta as { "chaos/error"?: ChaosError } | undefined)?.["chaos/error"];
const paragraph = (id: string, body: string) => ({ id, type: "paragraph", text: body, citations: [], conceptIds: [] });

async function setup() {
  vi.setSystemTime(PERF_EPOCH);
  const t = createTestConvex();
  await signIn(t, perfCreator, "perry");
  await signIn(t, perfStudent, "sam");
  const owner = await connectMcp(convexMcpCaller(t, perfCreator.subject));
  const rival = await connectMcp(convexMcpCaller(t, perfStudent.subject));
  const call = async <R = Record<string, unknown>>(client: Mcp, name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, `${name}: ${text(result)}`).toBeFalsy();
    return result.structuredContent as R;
  };
  const { lessonId } = await call<{ lessonId: string }>(owner, "create_lesson", { metadata: lessonMeta("Owned"), document: { schemaVersion: 1, blocks: [paragraph("p1", "Text")] }, publish: false });
  return { t, owner, rival, call, lessonId };
}

/** Asserts a categorized, recoverable error and returns it. */
function expectError(result: Result, code: string, category: string) {
  expect(result.isError, text(result)).toBe(true);
  const error = errorOf(result);
  expect(error, text(result)).toMatchObject({ code, category });
  expect(text(result)).toMatch(new RegExp(`^${code} \\(${category}\\): `));
  expect(text(result)).not.toMatch(/Something went wrong|could not complete this/);
  return error!;
}

describe("MCP error quality", { timeout: 30_000 }, () => {
  it("validation: names the bad field for schema and content problems", async () => {
    const { owner } = await setup();
    const schema = expectError(await owner.callTool({ name: "create_lesson", arguments: { metadata: { description: "No title", language: "en", tags: [] } } }), "VALIDATION_FAILED", "validation");
    expect(JSON.stringify(schema.details)).toContain("metadata.title");
    expect(schema.retryable).toBe(false);

    const content = await owner.callTool({ name: "create_form", arguments: { title: "Quiz", quizMode: true, questions: [{ type: "single_choice", label: "Largest planet?", options: ["Mars", "Jupiter"], correctAnswers: ["Saturn"] }] } });
    expectError(content, "VALIDATION_FAILED", "validation");
    expect(text(content)).toContain("Saturn");
  });

  it("permission: an account without administrator access", async () => {
    const { t } = await setup();
    const adminServer = await connectMcp(convexMcpCaller(t, perfCreator.subject), true);
    const result = await adminServer.callTool({ name: "get_admin_overview", arguments: {} });
    expect(errorOf(result)?.category).toBe("permission");
    expect(text(result)).not.toMatch(/Something went wrong/);
  });

  it("ownership: changing who may answer someone else's form", async () => {
    const { owner, rival, call } = await setup();
    const form = await call<{ id: string }>(owner, "create_form", { title: "Owner's form", questions: [{ type: "short_text", label: "Name?" }] });
    const result = await rival.callTool({ name: "set_form_response_controls", arguments: { formId: form.id, expectedSettingsRevision: 0, patch: { responseLimit: 1 } } });
    expectError(result, "FORBIDDEN", "ownership");
  });

  it("not found: another account's private lesson, without revealing it exists", async () => {
    const { rival, lessonId } = await setup();
    const result = await rival.callTool({ name: "update_lesson_blocks", arguments: { lessonId, expectedRevision: 1, blocks: [paragraph("p1", "Taken over")] } });
    expectError(result, "NOT_FOUND", "not_found");
    expect(text(result)).not.toContain("Owned");
  });

  it("revision conflict: a stale revision, with the current one to retry from", async () => {
    const { owner, call, lessonId } = await setup();
    const { revision } = await call<{ revision: number }>(owner, "get_lesson", { lessonId, view: "draft" });
    await call(owner, "update_lesson_blocks", { lessonId, expectedRevision: revision, blocks: [paragraph("p1", "First edit")] });
    const error = expectError(await owner.callTool({ name: "update_lesson_blocks", arguments: { lessonId, expectedRevision: revision, blocks: [paragraph("p1", "Stale edit")] } }), "REVISION_CONFLICT", "revision_conflict");
    expect(error.retryable).toBe(true);
    expect(error.details?.currentRevision).toBe(revision + 1);
  });

  it("publication constraint: publishing an archived lesson", async () => {
    const { owner, call, lessonId } = await setup();
    const { revision } = await call<{ revision: number }>(owner, "get_lesson", { lessonId, view: "draft" });
    await call(owner, "set_lesson_lifecycle", { lessonId, expectedRevision: revision, action: "archive" });
    const after = await call<{ revision: number }>(owner, "get_lesson", { lessonId, view: "draft" });
    expectError(await owner.callTool({ name: "publish_lesson", arguments: { lessonId, expectedRevision: after.revision, visibility: "public" } }), "INVALID_STATUS", "publication");
  });

  it("internal: a genuine fault is reported as retryable without leaking its details", async () => {
    const broken = await connectMcp(async () => { throw new TypeError("Cannot read properties of undefined (reading 'ownerId')"); });
    const result = await broken.callTool({ name: "list_lessons", arguments: { scope: "owned" } });
    expect(errorOf(result)).toMatchObject({ code: "ERROR", category: "internal", retryable: true });
    expect(text(result)).not.toContain("ownerId");
  });
});
