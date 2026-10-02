import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";
const metadata = { title: "Pressure", description: "", language: "en", tags: [] };
it("searches published content and never returns newer private drafts", async () => {
  const t = createTestConvex(); const owner = t.withIdentity(creatorIdentity);
  const document = { schemaVersion: 1 as const, blocks: [{ id: "saag", type: "paragraph" as const, text: "SAAG interpretation", citations: [], conceptIds: [] }] };
  const lessonId = await owner.mutation(api.lessons.create, { metadata, document });
  const first = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  expect(first.ok).toBe(true);
  await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 1, document: { ...document, blocks: [{ ...document.blocks[0], text: "PRIVATE phrase" }] } });
  const result = await t.query(api.learnSearch.searchPublic, { text: "SAAG", paginationOpts: { cursor: null, numItems: 10 } });
  expect(result.page).toHaveLength(1); expect(result.page[0].matchingBlocks[0].text).toBe("SAAG interpretation");
  expect((await t.query(api.learnSearch.searchPublic, { text: "PRIVATE", paginationOpts: { cursor: null, numItems: 10 } })).page).toEqual([]);
  await owner.mutation(api.lessons.setLifecycle, { lessonId, expectedRevision: 2, action: "archive" });
  expect((await t.query(api.learnSearch.searchPublic, { text: "SAAG", paginationOpts: { cursor: null, numItems: 10 } })).page).toEqual([]);
});
describe("Learn deployment limits", () => {
  it("refuses too many blocks and documents over the UTF-8 budget", async () => {
    const t = createTestConvex(); const owner = t.withIdentity(creatorIdentity);
    const blocks = Array.from({ length: 501 }, (_, i) => ({ id: `b${i}`, type: "paragraph" as const, text: "hi", citations: [], conceptIds: [] }));
    await expect(owner.mutation(api.lessons.create, { metadata, document: { schemaVersion: 1, blocks } })).rejects.toThrow("VALIDATION");
    const large = Array.from({ length: 20 }, (_, i) => ({ ...blocks[i], text: "\u0633".repeat(10_000) }));
    await expect(owner.mutation(api.lessons.create, { metadata, document: { schemaVersion: 1, blocks: large } })).rejects.toThrow("VALIDATION");
  });
});
