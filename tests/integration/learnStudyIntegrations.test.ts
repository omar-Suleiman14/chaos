import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { makeFunctionReference, httpRouter } from "convex/server";
import { api } from "@/convex/_generated/api";
import { registerLearnStudyIntegrationRoutes } from "@/convex/learnStudyIntegrations";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

const read = makeFunctionReference<"query">("learnStudyIntegrations:getProgress");
const write = makeFunctionReference<"mutation">("learnStudyIntegrations:writeProgress");
const context = makeFunctionReference<"query">("learnStudyIntegrations:getContext");
beforeEach(() => vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer));
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), other = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Study", description: "", language: "en", tags: [] }, document: { schemaVersion: 1, blocks: [{ id: "a", type: "paragraph", text: "Selected", citations: [], conceptIds: [] }, { id: "b", type: "paragraph", text: "Excluded", citations: [], conceptIds: [] }] } });
  const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "private" });
  if (!published.ok) throw new Error("Publication failed");
  const connection = await owner.mutation(api.integrations.createConnection, { label: "Study", access: "selected", itemRefs: [], scopes: ["progress:read", "progress:write"] });
  await t.run(ctx => ctx.db.patch("integrationTokens", connection.tokenId, { itemRefs: [`lesson_${lessonId}`] }));
  const target = { tokenId: connection.tokenId, lessonId, versionId: published.versionId };
  return { t, owner, other, target };
}
it("shares the native identity key, guards sequences and replays without opening another session", async () => {
  const { t, owner, target } = await setup();
  const start = { ...target, idempotencyKey: "start", operation: { action: "start" } };
  expect(await t.mutation(write, start)).toMatchObject({ status: 200, body: { sessionSeq: 1 } });
  expect(await t.mutation(write, start)).toMatchObject({ status: 200, headers: { "Idempotent-Replayed": "true" } });
  const completion = { ...target, idempotencyKey: "complete", operation: { action: "complete", sessionSeq: 1, writeSeq: 1, blockIds: ["a"] } };
  expect(await t.mutation(write, completion)).toMatchObject({ status: 200, body: { completedBlocks: ["a"] } });
  expect(await owner.query(api.learnCommunity.getProgress, { lessonId: target.lessonId, versionId: target.versionId })).toMatchObject({ sessionSeq: 1, writeSeq: 1, completedBlocks: ["a"] });
  expect(await t.mutation(write, { ...completion, idempotencyKey: "stale" })).toMatchObject({ status: 409 });
  expect(await t.mutation(write, { ...completion, operation: { ...completion.operation, blockIds: ["b"] } })).toMatchObject({ status: 422 });
  expect(await t.mutation(write, { ...completion, idempotencyKey: "bad", operation: { ...completion.operation, writeSeq: 2, blockIds: ["missing"] } })).toMatchObject({ status: 400 });
  expect(await t.query(read, target)).toMatchObject({ body: { progress: { completedBlockIds: ["a"] } } });
});
it("rechecks scopes, selection and token validity before replay and prevents cross-user reads", async () => {
  const { t, other, target } = await setup();
  const start = { ...target, idempotencyKey: "start", operation: { action: "start" } };
  await t.mutation(write, start);
  await t.run(ctx => ctx.db.patch("integrationTokens", target.tokenId, { scopes: ["progress:read"] }));
  expect(await t.mutation(write, start)).toMatchObject({ status: 403 });
  await t.run(ctx => ctx.db.patch("integrationTokens", target.tokenId, { itemRefs: [] }));
  expect(await t.query(read, target)).toMatchObject({ status: 404 });
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  await t.run(ctx => ctx.db.patch("integrationTokens", target.tokenId, { itemRefs: [`lesson_${target.lessonId}`], ownerId: otherCreatorIdentity.subject }));
  expect(await t.query(read, target)).toMatchObject({ status: 404 });
  await expect(other.query(api.learnCommunity.getProgress, { lessonId: target.lessonId, versionId: target.versionId })).rejects.toThrow();
  await t.run(ctx => ctx.db.patch("integrationTokens", target.tokenId, { revokedAt: Date.now() }));
  expect(await t.query(read, target)).toMatchObject({ status: 401 });
});
it("rejects stale draft revision and wrong lesson versions", async () => {
  const { t, target } = await setup();
  expect(await t.query(read, { ...target, versionId: undefined, revision: 999 })).toMatchObject({ status: 409 });
  expect(await t.query(read, { ...target, revision: 0 })).toMatchObject({ status: 400 });
});
it("invalidates an older device session and fails closed without configured issuer", async () => {
  const { t, target } = await setup();
  await t.mutation(write, { ...target, idempotencyKey: "first", operation: { action: "start" } });
  expect(await t.mutation(write, { ...target, idempotencyKey: "second", operation: { action: "start" } })).toMatchObject({ body: { sessionSeq: 2 } });
  expect(await t.mutation(write, { ...target, idempotencyKey: "old-device", operation: { action: "complete", sessionSeq: 1, writeSeq: 99, blockIds: ["a"] } })).toMatchObject({ status: 409 });
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "");
  expect(await t.query(read, target)).toMatchObject({ status: 400 });
});
it("accepts connection-created lesson selection without a broad all-assets grant", async () => {
  const { t, target } = await setup();
  await t.run(async ctx => {
    await ctx.db.patch("integrationTokens", target.tokenId, { access: "all", itemRefs: [] });
  });
  expect(await t.query(read, target)).toMatchObject({ status: 404 });
  await t.run(ctx => ctx.db.insert("integrationCreatedItems", { tokenId: target.tokenId, itemRef: `lesson_${target.lessonId}`, createdAt: Date.now() }));
  expect(await t.query(read, target)).toMatchObject({ status: 200 });
});
it("exports only selected blocks and independently selected source metadata", async () => {
  const { t, owner, target } = await setup();
  const sourceId = await owner.mutation(api.learnSources.create, { metadata: { title: "Private reference", kind: "reference", origin: "Publisher" }, metadataVisibility: "private", contentVisibility: "private" });
  await owner.mutation(api.lessons.saveDraft, { lessonId: target.lessonId, expectedRevision: 1, document: { schemaVersion: 1, blocks: [{ id: "a", type: "paragraph", text: "Selected", citations: [{ sourceId, locator: { kind: "page", page: 23 } }], conceptIds: [] }, { id: "b", type: "paragraph", text: "Excluded", citations: [], conceptIds: [] }] } });
  await owner.mutation(api.learnSources.update, { sourceId, metadataVisibility: "public" });
  const published = await owner.mutation(api.lessons.publish, { lessonId: target.lessonId, expectedRevision: 2, visibility: "private" });
  if (!published.ok) throw new Error("Publish failed");
  await owner.mutation(api.learnSources.update, { sourceId, metadataVisibility: "private" });
  await t.run(ctx => ctx.db.patch("integrationTokens", target.tokenId, { scopes: ["progress:read", "sources:read", "tutor:context"] }));
  const args = { ...target, versionId: published.versionId, blockIds: ["a"], sourceIds: [sourceId], includeMyProgress: false };
  expect(await t.query(context, args)).toMatchObject({ status: 404 });
  await t.run(ctx => ctx.db.patch("integrationTokens", target.tokenId, { itemRefs: [`lesson_${target.lessonId}`, `source_${sourceId}`] }));
  const packet = await t.query(context, args);
  expect(packet).toMatchObject({ status: 200, body: { blocks: [{ id: "a" }], sources: [{ includesContent: false }], boundaries: { privateNotesIncluded: false, sourceExcerptsIncluded: false } } });
  expect(JSON.stringify(packet)).not.toContain("Excluded"); expect(JSON.stringify(packet)).not.toContain("storageId");
  expect(await t.query(context, { ...args, blockIds: ["b"] })).toMatchObject({ status: 400 });
  await t.run(ctx => ctx.db.patch("integrationTokens", target.tokenId, { scopes: ["tutor:context"] }));
  expect(await t.query(context, args)).toMatchObject({ status: 403 });
  expect(await t.query(context, { ...args, sourceIds: [], includeMyProgress: true })).toMatchObject({ status: 403 });
});
it("registers only the assigned separate prefixes", () => {
  const router = httpRouter(); registerLearnStudyIntegrationRoutes(router);
  expect(router.lookup("/api/integrations/v2/context/assemble", "POST")).not.toBeNull();
  expect(router.lookup("/api/integrations/v2/progress/lesson_test", "GET")).not.toBeNull();
  expect(router.lookup("/api/integrations/v2/lessons/test", "GET")).toBeNull();
});
