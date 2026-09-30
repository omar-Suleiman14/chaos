import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { enqueueLearnWebhookEvent } from "@/convex/learnWebhookEvents";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";

async function setup() {
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Secret lecture", description: "Private", language: "en", tags: [] }, document: { schemaVersion: 1, blocks: [] } });
  const ids = await t.run(async ctx => {
    const tokenId = await ctx.db.insert("integrationTokens", { ownerId: creatorIdentity.subject, label: "Learn", tokenHash: "hash", tokenHint: "hint", scopes: ["webhooks:manage", "lessons:read"], access: "all", itemRefs: [`lesson_${lessonId}`], createdAt: Date.now() });
    const subId = await ctx.db.insert("webhookSubscriptions", { ownerId: creatorIdentity.subject, url: "https://hooks.example.com", description: "test", events: ["lesson.updated"], target: "connection", itemRefs: [], includeAnswers: false, secretCiphertext: "test", secretHint: "test", status: "active", consecutiveFailures: 0, connectionId: tokenId, createdAt: Date.now(), updatedAt: Date.now() });
    return { tokenId, subId };
  });
  const emit = () => t.run(ctx => enqueueLearnWebhookEvent(ctx, { lessonId, event: "lesson.updated", operationId: "save:1", revision: 1 }));
  return { t, lessonId, ...ids, emit };
}

describe("Learn webhook transport", () => {
  it("enqueues from a committed draft edit and never from a stale write", async () => {
    const { t, lessonId } = await setup();
    const owner = t.withIdentity(creatorIdentity);
    const document = { schemaVersion: 1 as const, blocks: [] };
    expect(await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document })).toBe(1);
    await expect(owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document })).rejects.toThrow("REVISION_CONFLICT");
    const deliveries = await t.run(ctx => ctx.db.query("webhookDeliveries").collect());
    expect(deliveries).toHaveLength(1);
    expect(JSON.parse(deliveries[0].payload!).data.revision).toBe(1);
  });
  it("supports owner-selected collection events without expanding owner all", async () => {
    const { t, subId } = await setup();
    const collectionId = await t.run(async ctx => {
      const id = await ctx.db.insert("learnCollections", { ownerId: creatorIdentity.subject, metadata: { title: "Study pack", description: "", language: "en", tags: [] }, items: [], revision: 0, visibility: "private", communityState: "ok", createdAt: Date.now(), updatedAt: Date.now() });
      await ctx.db.patch("webhookSubscriptions", subId, { connectionId: undefined, target: "selected", itemRefs: [`collection_${id}`], events: ["collection.updated"] });
      return id;
    });
    expect(await t.run(ctx => enqueueLearnWebhookEvent(ctx, { collectionId, event: "collection.updated", operationId: "edit:1", revision: 1 }))).toBe(1);
    await t.run(ctx => ctx.db.patch("webhookSubscriptions", subId, { target: "all", itemRefs: [] }));
    expect(await t.run(ctx => enqueueLearnWebhookEvent(ctx, { collectionId, event: "collection.updated", operationId: "edit:2", revision: 2 }))).toBe(0);
  });
  it("queues metadata only and deduplicates operation retries", async () => {
    const { t, emit } = await setup();
    expect(await emit()).toBe(1); expect(await emit()).toBe(0);
    const rows = await t.run(ctx => ctx.db.query("webhookDeliveries").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].containsAnswers).toBe(false);
    expect(JSON.parse(rows[0].payload!).data).toEqual({ itemRef: rows[0].itemRef, lessonId: rows[0].itemRef!.slice(7), revision: 1 });
    expect(rows[0].payload).not.toContain("Secret lecture");
    expect(await t.mutation(internal.webhooks.claimAttempt, { deliveryId: rows[0]._id })).not.toBeNull();
  });
  it("never expands legacy all access or delivers without exact read scope", async () => {
    const { t, tokenId, emit } = await setup();
    await t.run(ctx => ctx.db.patch("integrationTokens", tokenId, { itemRefs: [] }));
    expect(await emit()).toBe(0);
    await t.run(ctx => ctx.db.patch("integrationTokens", tokenId, { scopes: ["webhooks:manage"] }));
    expect(await emit()).toBe(0);
  });
  it.each(["selection", "scope", "revocation", "owner"])("cancels queued events after %s changes", async reason => {
    const { t, tokenId, lessonId, emit } = await setup();
    expect(await emit()).toBe(1);
    const delivery = await t.run(async ctx => (await ctx.db.query("webhookDeliveries").first())!);
    await t.run(async ctx => {
      if (reason === "selection") await ctx.db.patch("integrationTokens", tokenId, { itemRefs: [] });
      if (reason === "scope") await ctx.db.patch("integrationTokens", tokenId, { scopes: ["webhooks:manage"] });
      if (reason === "revocation") await ctx.db.patch("integrationTokens", tokenId, { revokedAt: Date.now() });
      if (reason === "owner") await ctx.db.patch("lessons", lessonId, { ownerId: "another-owner" });
    });
    expect(await t.mutation(internal.webhooks.claimAttempt, { deliveryId: delivery._id })).toBeNull();
    expect((await t.run(ctx => ctx.db.get("webhookDeliveries", delivery._id)))!.status).toBe("cancelled");
  });
});
