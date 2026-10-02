import { describe, expect, it } from "vitest";
import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DurableLessonClient, DurableProgressClient } from "../../lib/learn/durableClient";
import { fromDurableDocument } from "../../lib/learn/chaosDocument";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";
const metadata = { title: "Original", description: "", language: "en", tags: [] };
const document = { schemaVersion: 1 as const, blocks: [{ id: "p", type: "paragraph" as const, text: "Initial", citations: [], conceptIds: [] }] };
async function setup() {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  const lessonId = await owner.mutation(api.lessons.create, { metadata, document });
  const row = await owner.query(api.lessons.getDraft, { lessonId });
  const service = new DurableLessonClient({ query: owner.query, mutation: owner.mutation } as Pick<ConvexReactClient, "query" | "mutation">);
  service.observe(row);
  return { t, owner, lessonId, service };
}
describe("Learn frontend uses durable lifecycle services", () => {
  it("reloads a frozen revision explicitly and snapshots queued editor data", async () => {
    const { owner, lessonId, service } = await setup();
    await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document });
    await expect(service.saveMeta(lessonId, { title: "Stale" })).rejects.toThrow("REVISION_CONFLICT");
    const latest = await service.reload(lessonId);
    expect(latest.revision).toBe(1);
    const patch = { title: "Reviewed" };
    const saved = service.saveMeta(lessonId, patch);
    patch.title = "Mutated after enqueue";
    await saved;
    expect((await owner.query(api.lessons.getDraft, { lessonId })).metadata.title).toBe("Reviewed");
  });
  it("restores a recovery snapshot exactly while preserving the publication", async () => {
    const { owner, lessonId, service } = await setup();
    await service.publish(lessonId);
    const published = await owner.query(api.lessons.getPublished, { lessonId });
    await service.saveMeta(lessonId, { title: "New draft" });
    const candidates = await owner.query(api.lessons.listRecovery, { lessonId });
    const original = candidates.find(row => row.metadata.title === "Original")!;
    await service.recover(lessonId, original._id);
    const row = await owner.query(api.lessons.getDraft, { lessonId });
    expect(row.draft).toEqual(original.document);
    expect(row.metadata).toEqual(original.metadata);
    expect(await owner.query(api.lessons.getPublished, { lessonId })).toEqual(published);
  });
  it("syncs reading percentages and refuses to borrow a newer study session", async () => {
    const { owner, lessonId, service } = await setup();
    await service.saveContent(lessonId, fromDurableDocument({ schemaVersion: 1, blocks: [document.blocks[0], { ...document.blocks[0], id: "p2" }] }));
    await service.publish(lessonId);
    const version = (await owner.query(api.lessons.getPublished, { lessonId }))!;
    const target = { lessonId, versionId: version._id, blockIds: ["p", "p2"] };
    const progress = new DurableProgressClient({ query: owner.query, mutation: owner.mutation } as Pick<ConvexReactClient, "query" | "mutation">);
    await progress.save(target, { percent: 50 });
    expect((await owner.query(api.learnCommunity.getProgress, { lessonId, versionId: version._id }))?.completedBlocks).toEqual(["p"]);
    await owner.mutation(api.learnCommunity.startSession, { lessonId, versionId: version._id });
    await expect(progress.save(target, { state: "completed" })).rejects.toThrow("Progress conflict");
    await expect(progress.save(target, { state: "completed" })).rejects.toThrow("Progress conflict");
    expect((await owner.query(api.learnCommunity.getProgress, { lessonId, versionId: version._id }))?.completedBlocks).toEqual(["p"]);
  });
  it("serializes autosave then metadata then publication without replacing newer draft content", async () => {
    const { owner, lessonId, service } = await setup();
    const edited = fromDurableDocument({ ...document, blocks: [{ ...document.blocks[0], text: "Edited", inline: [{ text: "Edited", marks: { bold: true } }] }] });
    service.setVisibility(lessonId, "public");
    const content = service.saveContent(lessonId, edited);
    const meta = service.saveMeta(lessonId, { title: "Renamed" });
    const published = service.publish(lessonId, "Updated explanation");
    await Promise.all([content, meta, published]);
    const version = await owner.query(api.lessons.getPublished, { lessonId });
    expect(version?.document.blocks[0]).toMatchObject({ text: "Edited", inline: [{ text: "Edited", marks: { bold: true } }] });
    expect(version?.metadata.title).toBe("Renamed");
    expect(version?.note).toBe("Updated explanation");
    await service.saveContent(lessonId, fromDurableDocument(document));
    expect((await owner.query(api.lessons.getPublished, { lessonId }))?.document).toEqual(version?.document);
  });
  it("freezes stale writes and publication instead of adopting another device's revision", async () => {
    const { owner, lessonId, service } = await setup();
    await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: { ...document, blocks: [{ ...document.blocks[0], text: "Other device" }] } });
    await expect(service.saveContent(lessonId, fromDurableDocument(document))).rejects.toThrow("REVISION_CONFLICT");
    await expect(service.saveMeta(lessonId, { title: "Overwrite" })).rejects.toThrow("REVISION_CONFLICT");
    await expect(service.publish(lessonId)).rejects.toThrow("REVISION_CONFLICT");
    const draft = await owner.query(api.lessons.getDraft, { lessonId });
    expect(draft.draft.blocks[0]).toMatchObject({ text: "Other device" });
    expect(draft.publishedVersionId).toBeUndefined();
    expect(await owner.query(api.lessons.listRecovery, { lessonId })).toHaveLength(1);
  });
  it("restores a published version into draft without mutating published history", async () => {
    const { owner, lessonId, service } = await setup();
    await service.publish(lessonId);
    const before = await owner.query(api.lessons.getPublished, { lessonId });
    await service.saveMeta(lessonId, { title: "Changed" });
    await service.restore(lessonId, 1);
    const draft = await owner.query(api.lessons.getDraft, { lessonId });
    expect(draft.metadata.title).toBe("Original");
    expect(await owner.query(api.lessons.getPublished, { lessonId })).toEqual(before);
    await service.lifecycle(lessonId, "unpublish");
    expect(await owner.query(api.lessons.getPublished, { lessonId })).toBeNull();
    expect((await owner.query(api.lessons.listVersions, { lessonId, paginationOpts: { numItems: 10, cursor: null } })).page).toHaveLength(1);
  });
  it("blocks unsupported content and unlisted publication before any write", async () => {
    const { owner, lessonId, service } = await setup();
    expect(() => service.setVisibility(lessonId, "unlisted")).toThrow("Unlisted");
    await expect(service.saveContent(lessonId, [{ id: "p", type: "paragraph", props: {}, content: [{ type: "mention", props: { name: "x" } }], children: [] }])).rejects.toThrow("Unsupported");
    expect((await owner.query(api.lessons.getDraft, { lessonId })).revision).toBe(0);
    await service.saveContent(lessonId, fromDurableDocument(document));
    expect((await owner.query(api.lessons.getDraft, { lessonId })).revision).toBe(1);
  });
});
