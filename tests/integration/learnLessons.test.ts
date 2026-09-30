import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import type { LessonDocument } from "@/convex/learnModel";
const metadata = { title: "Portal hypertension", description: "Mechanisms", language: "en", tags: ["medicine"] };
const document: LessonDocument = { schemaVersion: 1, blocks: [{ id: "intro", type: "paragraph", text: "Portal pressure", citations: [], conceptIds: [] }] };
async function setup() {
  const t = createTestConvex(); const owner = t.withIdentity(creatorIdentity);
  const lessonId = await owner.mutation(api.lessons.create, { metadata, document });
  return { t, owner, lessonId, other: t.withIdentity(otherCreatorIdentity) };
}
describe("Learn lesson lifecycle", () => {
  it("keeps unpublished drafts private and refuses another creator's writes", async () => {
    const { t, other, lessonId } = await setup();
    await expect(t.query(api.lessons.getPublished, { lessonId })).rejects.toThrow("unauthorized");
    await expect(other.query(api.lessons.getDraft, { lessonId })).rejects.toThrow("unauthorized");
    await expect(other.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document })).rejects.toThrow("unauthorized");
  });
  it("snapshots publication, rejects stale saves, restores without rewriting history", async () => {
    const { t, owner, lessonId } = await setup();
    const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
    expect(published.ok).toBe(true); if (!published.ok) throw new Error("publish failed");
    const changed: LessonDocument = { ...document, blocks: [{ ...document.blocks[0], type: "paragraph", text: "New draft" }] };
    expect(await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 1, document: changed })).toBe(2);
    expect((await t.query(api.lessons.getPublished, { lessonId }))?.document).toEqual(document);
    await expect(owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 1, document })).rejects.toThrow("REVISION_CONFLICT");
    expect(await owner.mutation(api.lessons.restoreVersion, { lessonId, versionId: published.versionId, expectedRevision: 2 })).toBe(3);
    expect((await owner.query(api.lessons.getDraft, { lessonId })).draft).toEqual(document);
    expect((await owner.query(api.lessons.listRecovery, { lessonId })).map(r => r.revision)).toEqual([2, 1]);
    expect((await owner.query(api.lessons.listVersions, { lessonId, paginationOpts: { cursor: null, numItems: 10 } })).page).toHaveLength(1);
  });
  it("preserves origin and parent version through a fork of a fork", async () => {
    const { t, owner, other, lessonId } = await setup();
    const first = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
    if (!first.ok) throw new Error("publish failed");
    const forkId = await other.mutation(api.lessons.fork, { lessonId, versionId: first.versionId });
    const second = await other.mutation(api.lessons.publish, { lessonId: forkId, expectedRevision: 0, visibility: "public" });
    if (!second.ok) throw new Error("publish failed");
    const thirdId = await owner.mutation(api.lessons.fork, { lessonId: forkId, versionId: second.versionId });
    const third = await owner.query(api.lessons.getDraft, { lessonId: thirdId });
    expect(third.originLessonId).toBe(lessonId); expect(third.parentLessonId).toBe(forkId); expect(third.parentVersionId).toBe(second.versionId);
    await other.mutation(api.lessons.setLifecycle, { lessonId: forkId, expectedRevision: 1, action: "unpublish" });
    await expect(t.query(api.lessons.getPublished, { lessonId: forkId })).rejects.toThrow("unauthorized");
    expect(third.draft).toEqual(document);
  });
  it("rejects invalid block ids, cyclic parents, video times and large documents", async () => {
    const { owner, lessonId } = await setup();
    for (const blocks of [
      [document.blocks[0], document.blocks[0]],
      [{ ...document.blocks[0], parentId: "intro" }],
      [{ id: "video", type: "youtube" as const, videoId: "bad", start: -1, caption: "", citations: [], conceptIds: [] }],
      [{ ...document.blocks[0], type: "paragraph" as const, text: "a".repeat(20_001) }],
    ]) await expect(owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks } })).rejects.toThrow("VALIDATION");
  });
  it("gives actionable publication errors without changing public state", async () => {
    const { owner, lessonId } = await setup();
    await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks: [] } });
    expect(await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 1, visibility: "public" })).toEqual({ ok: false, problems: [{ path: "blocks", code: "EMPTY", message: "Add material before publishing." }] });
    expect((await owner.query(api.lessons.getDraft, { lessonId })).publishedVersionId).toBeUndefined();
  });
});
