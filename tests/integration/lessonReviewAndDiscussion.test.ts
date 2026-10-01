import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());
const textOf = (block: unknown) => (block as { text?: string }).text;
const metadata = { title: "Imported notes", description: "", language: "en", tags: [] };
const document = { schemaVersion: 1 as const, blocks: [{ id: "intro", type: "paragraph" as const, text: "Original notes", citations: [], conceptIds: [] }] };

async function connected() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const connection = await owner.mutation(api.integrations.createConnection, { label: "Max", access: "selected", itemRefs: [], scopes: ["lessons:read", "lessons:create", "lessons:update"] });
  const created = await t.mutation(internal.learnIntegrations.createDraft, { tokenId: connection.tokenId, idempotencyKey: "create", body: { kind: "lesson", metadata, document } });
  const item = (created.body as { item: { itemRef: string; lessonId: Id<"lessons"> } }).item;
  return { t, owner, tokenId: connection.tokenId, item };
}

it("holds connected-app updates for review when the owner asks, then applies only on accept", async () => {
  const { t, owner, tokenId, item } = await connected();
  await owner.mutation(api.lessonProposals.setReviewMode, { tokenId, review: true });
  const edit = { tokenId, ref: item.itemRef, ifMatch: "0", idempotencyKey: "edit", blocks: true, body: { operations: [{ action: "update", blockId: "intro", block: { ...document.blocks[0], text: "Reviewed notes" } }] } };
  const staged = await t.mutation(internal.learnIntegrations.updateDraft, edit);
  expect(staged.status).toBe(202);
  // A replay returns the same staged result instead of a second proposal.
  expect((await t.mutation(internal.learnIntegrations.updateDraft, edit)).status).toBe(202);
  expect((await owner.query(api.lessons.getDraft, { lessonId: item.lessonId })).draft.blocks.map(textOf)[0]).toBe("Original notes");
  const [pending, ...rest] = await owner.query(api.lessonProposals.listPending, {});
  expect(rest).toHaveLength(0);
  expect(pending.current).toBe(true);
  expect(pending.proposed.document.blocks.map(textOf)[0]).toBe("Reviewed notes");

  // Another person cannot decide on it.
  const other = t.withIdentity(otherCreatorIdentity);
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  await expect(other.mutation(api.lessonProposals.accept, { proposalId: pending.id })).rejects.toThrow("NOT_FOUND");

  // The owner edits meanwhile: accepting needs an explicit choice, then re-applies the block edit on top.
  const lesson = await owner.query(api.lessons.getDraft, { lessonId: item.lessonId });
  await owner.mutation(api.lessons.saveDraft, { lessonId: item.lessonId, expectedRevision: lesson.revision, document: { schemaVersion: 1, blocks: [...document.blocks, { id: "mine", type: "paragraph", text: "My addition", citations: [], conceptIds: [] }] } });
  await expect(owner.mutation(api.lessonProposals.accept, { proposalId: pending.id })).rejects.toThrow("REVISION_CONFLICT");
  await owner.mutation(api.lessonProposals.accept, { proposalId: pending.id, onTop: true });
  const after = await owner.query(api.lessons.getDraft, { lessonId: item.lessonId });
  expect(after.draft.blocks.map(textOf)).toEqual(["Reviewed notes", "My addition"]);
  expect(await owner.query(api.lessonProposals.listPending, {})).toHaveLength(0);
});

it("rejecting leaves the draft untouched; review off saves directly", async () => {
  const { t, owner, tokenId, item } = await connected();
  await owner.mutation(api.lessonProposals.setReviewMode, { tokenId, review: true });
  await t.mutation(internal.learnIntegrations.updateDraft, { tokenId, ref: item.itemRef, ifMatch: "0", idempotencyKey: "a", body: { document: { ...document, blocks: [{ ...document.blocks[0], text: "Replaced" }] } } });
  const [pending] = await owner.query(api.lessonProposals.listPending, {});
  await owner.mutation(api.lessonProposals.reject, { proposalId: pending.id });
  expect((await owner.query(api.lessons.getDraft, { lessonId: item.lessonId })).draft.blocks.map(textOf)[0]).toBe("Original notes");
  await owner.mutation(api.lessonProposals.setReviewMode, { tokenId, review: false });
  expect((await t.mutation(internal.learnIntegrations.updateDraft, { tokenId, ref: item.itemRef, ifMatch: "0", idempotencyKey: "b", body: { document: { ...document, blocks: [{ ...document.blocks[0], text: "Direct" }] } } })).status).toBe(200);
});

it("keeps anchored discussions on readable lessons, with author/owner controls", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), reader = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await reader.mutation(api.quizFunctions.getOrCreateUser, {});
  const lessonId = await owner.mutation(api.lessons.create, { metadata, document });
  // Private lesson: a stranger can neither read nor write its discussions.
  await expect(reader.query(api.learnDiscussions.listThreads, { lessonId })).rejects.toThrow();
  await expect(reader.mutation(api.learnDiscussions.startThread, { lessonId, body: "Hi" })).rejects.toThrow();
  const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  if (!published.ok) throw new Error("Expected publication");

  const threadId = await reader.mutation(api.learnDiscussions.startThread, { lessonId, blockId: "intro", anchorExcerpt: "Original notes", body: "Why is this?" });
  await owner.mutation(api.learnDiscussions.reply, { threadId, body: "Because." });
  await expect(reader.mutation(api.learnDiscussions.startThread, { lessonId, body: "   " })).rejects.toThrow("EMPTY");
  let [thread] = await t.query(api.learnDiscussions.listThreads, { lessonId });
  expect(thread.blockId).toBe("intro");
  expect(thread.comments.map(c => c.body)).toEqual(["Why is this?", "Because."]);

  // The reader cannot remove the owner's reply; the owner can remove anyone's and resolve.
  await expect(reader.mutation(api.learnDiscussions.removeComment, { commentId: thread.comments[1].id })).rejects.toThrow("FORBIDDEN");
  await owner.mutation(api.learnDiscussions.removeComment, { commentId: thread.comments[0].id });
  await owner.mutation(api.learnDiscussions.resolve, { threadId, resolved: true });
  [thread] = await t.query(api.learnDiscussions.listThreads, { lessonId });
  expect(thread.resolved).toBe(true);
  expect(thread.comments[0]).toMatchObject({ body: "", authorName: "", moderation: "removed" });
});

it("shares a selected published collection's order, never without collections:read", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const lessonId = await owner.mutation(api.lessons.create, { metadata, document });
  const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  if (!published.ok) throw new Error("Expected publication");
  const collectionId = await owner.mutation(api.learnCollections.create, { metadata: { ...metadata, title: "GIT pack" } });
  const revision = await owner.mutation(api.learnCollections.replaceItems, { collectionId, expectedRevision: 0, items: [{ kind: "lesson", id: lessonId, versionId: published.versionId }] });
  await owner.mutation(api.learnCollections.publish, { collectionId, expectedRevision: revision, visibility: "private" });
  const plain = await owner.mutation(api.integrations.createConnection, { label: "Max", access: "selected", itemRefs: [], scopes: ["lessons:read"] });
  await expect(owner.mutation(api.learnIntegrations.setCollectionSelection, { tokenId: plain.tokenId, collectionIds: [collectionId] })).rejects.toThrow("INSUFFICIENT_SCOPE");
  const connection = await owner.mutation(api.integrations.createConnection, { label: "Max", access: "selected", itemRefs: [], scopes: ["collections:read"] });
  const ref = `collection_${collectionId}`;
  expect((await t.query(internal.learnIntegrations.getCollection, { tokenId: connection.tokenId, now: Date.now(), ref })).status).toBe(404);
  await owner.mutation(api.learnIntegrations.setCollectionSelection, { tokenId: connection.tokenId, collectionIds: [collectionId] });
  const read = await t.query(internal.learnIntegrations.getCollection, { tokenId: connection.tokenId, now: Date.now(), ref });
  expect(read.status).toBe(200);
  expect(read.body).toMatchObject({ collection: { title: "GIT pack", items: [{ ref: `lesson_${lessonId}` }] } });
});
