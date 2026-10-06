import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { LEARN_LIMITS } from "@/convex/learnModel";
import { createTestConvex } from "./setup";
import { LARGE_LESSON_MIX, largeLessonBlocks, lessonMeta, perfCreator, PERF_EPOCH, seedLessonRefs, signIn } from "@/perf/lib/fixtures";
import { connectMcp, convexMcpCaller } from "@/perf/lib/mcp";

/**
 * Lessons at and past the size limit, mixing every embedded kind: paragraphs, images, videos,
 * diagrams, tables, flashcards, quiz embeds and toggles. 500 blocks must save, publish and read
 * back whole; 2,000 and 10,000 (a pasted textbook, an assistant's bulk import) must be refused
 * with a validation error that names the limit, through the app and through MCP, without writing.
 */
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  vi.setSystemTime(PERF_EPOCH);
  const t = createTestConvex();
  const owner = await signIn(t, perfCreator, "perry");
  const refs = await seedLessonRefs(t, owner);
  const mcp = await connectMcp(convexMcpCaller(t, perfCreator.subject));
  return { t, owner, refs, mcp };
}
type Mcp = Awaited<ReturnType<typeof setup>>["mcp"];
const errorOf = (result: Awaited<ReturnType<Mcp["callTool"]>>) => (result._meta as { "chaos/error"?: { code: string; category: string; details?: unknown } } | undefined)?.["chaos/error"];
const text = (result: Awaited<ReturnType<Mcp["callTool"]>>) => (result.content as { type: string; text: string }[])[0].text;

describe("large lessons", { timeout: 60_000 }, () => {
  it("covers every block kind in each run of the mix", () => {
    const blocks = largeLessonBlocks(LARGE_LESSON_MIX.length, { imageSourceId: "i", flashcardSetId: "f", quizFormId: "q" } as never);
    expect(new Set(blocks.map((b) => b.type))).toEqual(new Set(LARGE_LESSON_MIX));
    for (const kind of ["paragraph", "image", "youtube", "diagram", "table", "flashcards", "quiz", "toggle"]) expect(LARGE_LESSON_MIX).toContain(kind);
  });

  it(`saves, publishes and reads back a ${LEARN_LIMITS.blocks}-block lesson whole and in order`, async () => {
    const { t, owner, refs, mcp } = await setup();
    const document = { schemaVersion: 1 as const, blocks: largeLessonBlocks(LEARN_LIMITS.blocks, refs) };
    expect(JSON.stringify(document).length).toBeLessThan(LEARN_LIMITS.documentBytes);
    const lessonId = await owner.mutation(api.lessons.create, { metadata: lessonMeta("Cardiovascular physiology"), document });
    const draft = await owner.query(api.lessons.getDraft, { lessonId });
    const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: draft.revision, visibility: "public" });
    expect(published).toMatchObject({ ok: true });

    const reader = await t.query(api.learnFrontend.publicLesson, { id: lessonId });
    const blocks = (reader as { version: { document: { blocks: { id: string; type: string }[] } } }).version.document.blocks;
    expect(blocks.map((b) => b.id)).toEqual(document.blocks.map((b) => b.id));
    expect(new Set(blocks.map((b) => b.type))).toEqual(new Set(LARGE_LESSON_MIX));

    // An assistant reads it in pages of at most 100 blocks and gets every block back once, in order.
    const ids: string[] = [];
    for (let offset = 0; offset < LEARN_LIMITS.blocks; offset += 100) {
      const page = await mcp.callTool({ name: "get_lesson", arguments: { lessonId, view: "published", offset, limit: 100 } });
      expect(page.isError, text(page)).toBeFalsy();
      ids.push(...((page.structuredContent as { document: { blocks: { id: string }[] } }).document.blocks.map((b) => b.id)));
    }
    expect(ids).toEqual(document.blocks.map((b) => b.id));
  });

  it("saves a lesson near the 300 KB document limit through MCP", async () => {
    const { owner, refs, mcp } = await setup();
    const blocks = largeLessonBlocks(LEARN_LIMITS.blocks, refs).map((b) => (b.type === "paragraph" ? { ...b, text: b.text.padEnd(1_800, " The reflex adapts within seconds.") } : b));
    const size = JSON.stringify({ schemaVersion: 1, blocks }).length;
    expect(size).toBeGreaterThan(256 * 1024);
    expect(size).toBeLessThan(LEARN_LIMITS.documentBytes);
    const lessonId = await owner.mutation(api.lessons.create, { metadata: lessonMeta("Long lecture") });
    const saved = await mcp.callTool({ name: "save_lesson_draft", arguments: { lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks } } });
    expect(saved.isError, text(saved)).toBeFalsy();
    expect((await owner.query(api.lessons.getDraft, { lessonId })).draft.blocks).toHaveLength(LEARN_LIMITS.blocks);
  });

  for (const count of [2_000, 10_000]) {
    it(`refuses a ${count.toLocaleString("en")}-block lesson with a validation error and writes nothing`, async () => {
      const { t, owner, refs, mcp } = await setup();
      const document = { schemaVersion: 1 as const, blocks: largeLessonBlocks(count, refs) };
      const before = await t.run((ctx) => ctx.db.query("lessons").collect());

      await expect(owner.mutation(api.lessons.create, { metadata: lessonMeta("Too long"), document })).rejects.toThrow(`At most ${LEARN_LIMITS.blocks} blocks`);

      const created = await mcp.callTool({ name: "create_lesson", arguments: { metadata: lessonMeta("Too long"), document } });
      expect(created.isError).toBe(true);
      expect(errorOf(created)).toMatchObject({ code: "VALIDATION_FAILED", category: "validation" });
      expect(text(created)).toMatch(/document\.blocks/);
      expect(text(created)).toMatch(/500/);

      const lessonId = await owner.mutation(api.lessons.create, { metadata: lessonMeta("Empty") });
      const saved = await mcp.callTool({ name: "save_lesson_draft", arguments: { lessonId, expectedRevision: 0, document } });
      expect(errorOf(saved)).toMatchObject({ code: "VALIDATION_FAILED", category: "validation" });
      expect((await owner.query(api.lessons.getDraft, { lessonId })).revision).toBe(0);
      expect((await t.run((ctx) => ctx.db.query("lessons").collect())).length).toBe(before.length + 1);
    });
  }

  it("refuses appended blocks that would pass the limit and leaves the lesson as it was", async () => {
    const { owner, refs, mcp } = await setup();
    const lessonId = await owner.mutation(api.lessons.create, { metadata: lessonMeta("Nearly full"), document: { schemaVersion: 1, blocks: largeLessonBlocks(450, refs) } });
    const { revision } = await owner.query(api.lessons.getDraft, { lessonId });
    const added = await mcp.callTool({ name: "add_lesson_blocks", arguments: { lessonId, expectedRevision: revision, blocks: largeLessonBlocks(100, refs, "extra") } });
    expect(added.isError).toBe(true);
    expect(errorOf(added)).toMatchObject({ code: "VALIDATION_FAILED", category: "validation" });
    expect(text(added)).toMatch(/500/);
    const after = await owner.query(api.lessons.getDraft, { lessonId });
    expect(after.revision).toBe(revision);
    expect(after.draft.blocks).toHaveLength(450);
  });
});
