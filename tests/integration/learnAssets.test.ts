import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
const metadata = { title: "Study pack", description: "", tags: [], language: "en" };
const document = { schemaVersion: 1 as const, blocks: [{ id: "intro", type: "paragraph" as const, text: "Lesson", citations: [], conceptIds: [] }] };
describe("Learn collections and reusable cards", () => {
  it("snapshots ordered collections and protects ownership", async () => {
    const t = createTestConvex(); const owner = t.withIdentity(creatorIdentity); const other = t.withIdentity(otherCreatorIdentity);
    const lessonId = await owner.mutation(api.lessons.create, { metadata, document });
    const lessonVersion = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
    if (!lessonVersion.ok) throw new Error("publish failed");
    const collectionId = await owner.mutation(api.learnCollections.create, { metadata });
    const items = [{ kind: "lesson" as const, id: lessonId, versionId: lessonVersion.versionId }];
    await owner.mutation(api.learnCollections.replaceItems, { collectionId, expectedRevision: 0, items });
    await owner.mutation(api.learnCollections.publish, { collectionId, expectedRevision: 1, visibility: "public" });
    await owner.mutation(api.learnCollections.replaceItems, { collectionId, expectedRevision: 2, items: [] });
    expect((await t.query(api.learnCollections.getPublished, { collectionId }))?.items).toEqual(items);
    await expect(other.mutation(api.learnCollections.replaceItems, { collectionId, expectedRevision: 3, items })).rejects.toThrow("unauthorized");
    await expect(owner.mutation(api.learnCollections.replaceItems, { collectionId, expectedRevision: 2, items })).rejects.toThrow("REVISION_CONFLICT");
  });
  it("requires public lesson versions in public collections", async () => {
    const t = createTestConvex(); const owner = t.withIdentity(creatorIdentity);
    const lessonId = await owner.mutation(api.lessons.create, { metadata, document });
    const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "private" });
    if (!published.ok) throw new Error("publish failed");
    const collectionId = await owner.mutation(api.learnCollections.create, { metadata });
    await owner.mutation(api.learnCollections.replaceItems, { collectionId, expectedRevision: 0, items: [{ kind: "lesson", id: lessonId, versionId: published.versionId }] });
    await expect(owner.mutation(api.learnCollections.publish, { collectionId, expectedRevision: 1, visibility: "public" })).rejects.toThrow("unavailable");
  });
  it("versions cards independently and copies immutable fork content", async () => {
    const t = createTestConvex(); const owner = t.withIdentity(creatorIdentity); const other = t.withIdentity(otherCreatorIdentity);
    const cards = [{ id: "card1", front: "Question", back: "Answer", conceptIds: [] }];
    const setId = await owner.mutation(api.flashcards.create, { title: "Review", cards });
    const versionId = await owner.mutation(api.flashcards.publish, { setId, expectedRevision: 0, visibility: "public" });
    const forkId = await other.mutation(api.flashcards.fork, { setId, versionId });
    await owner.mutation(api.flashcards.save, { setId, expectedRevision: 1, title: "Updated", cards: [{ ...cards[0], back: "Different" }] });
    expect((await t.query(api.flashcards.getPublished, { setId }))?.cards).toEqual(cards);
    await t.run(async ctx => { const fork = await ctx.db.get("flashcardSets", forkId); expect(fork?.cards).toEqual(cards); expect(fork?.originSetId).toBe(setId); });
    await expect(other.mutation(api.flashcards.save, { setId, expectedRevision: 2, title: "Steal", cards })).rejects.toThrow("unauthorized");
  });
  it("allows editors to save but leaves publication and grants to owners", async () => {
    const t = createTestConvex(); const owner = t.withIdentity(creatorIdentity); const other = t.withIdentity(otherCreatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {}); await other.mutation(api.quizFunctions.getOrCreateUser, {});
    const lessonId = await owner.mutation(api.lessons.create, { metadata, document });
    await owner.mutation(api.lessonPermissions.set, { lessonId, userId: otherCreatorIdentity.subject, role: "editor" });
    await other.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document });
    await expect(other.mutation(api.lessons.publish, { lessonId, expectedRevision: 1, visibility: "public" })).rejects.toThrow("owner");
    await expect(other.mutation(api.lessonPermissions.set, { lessonId, userId: creatorIdentity.subject, role: "reader" })).rejects.toThrow("unauthorized");
    await owner.mutation(api.lessonPermissions.set, { lessonId, userId: otherCreatorIdentity.subject, role: null });
    await expect(other.query(api.lessons.getDraft, { lessonId })).rejects.toThrow("unauthorized");
  });
});
