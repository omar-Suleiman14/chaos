import { expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

it("records lifecycle history transactionally without exposing it to readers", async () => {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), reader = t.withIdentity(otherCreatorIdentity);
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Audit", description: "", tags: [], language: "en" }, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Published content", citations: [], conceptIds: [] }] } });
  const first = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public", note: "Corrected terminology" });
  if (!first.ok) throw new Error("Expected publication");
  await expect(owner.mutation(api.lessons.setLifecycle, { lessonId, expectedRevision: 0, action: "archive" })).rejects.toThrow();
  await owner.mutation(api.lessons.restoreVersion, { lessonId, versionId: first.versionId, expectedRevision: 1 });
  await owner.mutation(api.lessons.setLifecycle, { lessonId, expectedRevision: 2, action: "unpublish" });
  const args = { lessonId, paginationOpts: { numItems: 50, cursor: null } };
  const history = await owner.query(api.learnPublicationAudit.list, args);
  expect(history.page.map(e => e.action)).toEqual(["unpublish", "restore_draft", "publish", "create"]);
  expect(history.page.every(e => e.actorId === creatorIdentity.subject && e.reason.length > 0)).toBe(true);
  expect(history.page[0].beforeVisibility).toBe("public");
  expect(history.page[0].afterVisibility).toBe("private");
  expect((await t.run(ctx => ctx.db.get("lessonVersions", first.versionId)))?.note).toBe("Corrected terminology");
  expect(history.page.find(e => e.action === "publish")?.reason).toBe("Corrected terminology");
  await expect(reader.query(api.learnPublicationAudit.list, args)).rejects.toThrow();
  await expect(t.query(api.learnPublicationAudit.list, args)).rejects.toThrow();
  await t.run(ctx => ctx.db.insert("admins", { clerkId: otherCreatorIdentity.subject, email: otherCreatorIdentity.email!, grantedAt: Date.now() }));
  expect((await reader.query(api.learnPublicationAudit.list, args)).page).toHaveLength(4);
});

it("keeps fork provenance in the new owner's audit without granting parent audit access", async () => {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), reader = t.withIdentity(otherCreatorIdentity);
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Parent", description: "", tags: [], language: "en" }, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Content", citations: [], conceptIds: [] }] } });
  const result = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  if (!result.ok) throw new Error("Expected publication");
  const forkId = await reader.mutation(api.lessons.fork, { lessonId, versionId: result.versionId });
  const history = await reader.query(api.learnPublicationAudit.list, { lessonId: forkId, paginationOpts: { numItems: 10, cursor: null } });
  expect(history.page[0]).toMatchObject({ action: "fork", parentLessonId: lessonId, versionId: result.versionId, afterVisibility: "private" });
  await expect(reader.query(api.learnPublicationAudit.list, { lessonId, paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow();
});

it("audits collection and flashcard publication without exposing private history to readers", async () => {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), reader = t.withIdentity(otherCreatorIdentity);
  const setId = await owner.mutation(api.flashcards.create, { title: "Review", cards: [{ id: "card", front: "Question", back: "Answer", conceptIds: [] }] });
  const versionId = await owner.mutation(api.flashcards.publish, { setId, expectedRevision: 0, visibility: "public" });
  await owner.mutation(api.flashcards.setLifecycle, { setId, expectedRevision: 1, action: "unpublish" });
  const flashcardArgs = { asset: { kind: "flashcards" as const, id: setId }, paginationOpts: { numItems: 10, cursor: null } };
  const history = await owner.query(api.learnPublicationAudit.listAsset, flashcardArgs);
  expect(history.page.map(row => row.action)).toEqual(["unpublish", "publish", "create"]);
  expect(history.page[1].versionId).toBe(versionId);
  await expect(reader.query(api.learnPublicationAudit.listAsset, flashcardArgs)).rejects.toThrow();
  const sourceId = await owner.mutation(api.learnSources.create, { metadata: { title: "Reference", kind: "reference", origin: "Publisher" }, metadataVisibility: "public", contentVisibility: "private" });
  const collectionId = await owner.mutation(api.learnCollections.create, { metadata: { title: "Pack", description: "", tags: [], language: "en" } });
  await owner.mutation(api.learnCollections.replaceItems, { collectionId, expectedRevision: 0, items: [{ kind: "source", id: sourceId }] });
  const collectionVersion = await owner.mutation(api.learnCollections.publish, { collectionId, expectedRevision: 1, visibility: "public" });
  const collectionArgs = { asset: { kind: "collection" as const, id: collectionId }, paginationOpts: { numItems: 10, cursor: null } };
  expect((await owner.query(api.learnPublicationAudit.listAsset, collectionArgs)).page[0]).toMatchObject({ action: "publish", actorId: creatorIdentity.subject, revision: 2, versionId: collectionVersion });
  await expect(reader.query(api.learnPublicationAudit.listAsset, collectionArgs)).rejects.toThrow();
});
