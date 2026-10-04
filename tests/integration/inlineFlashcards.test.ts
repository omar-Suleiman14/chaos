import { expect, it, vi, afterEach } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";
afterEach(() => vi.unstubAllEnvs());

it("publishes reusable public decks inline and fails closed after unpublishing", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  const setId = await owner.mutation(api.flashcards.create, { title: "Recall", cards: [{ id: "card", front: "Question", back: "Answer", conceptIds: [] }] });
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Inline study", description: "", language: "en", tags: [] }, document: { schemaVersion: 1, blocks: [{ id: "deck", type: "flashcards", setId, citations: [], conceptIds: [] }] } });
  const rejected = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  expect(rejected.ok).toBe(false);
  expect(await t.query(api.learnFrontend.embeddedFlashcards, { setId })).toBeNull();
  await owner.mutation(api.flashcards.publish, { setId, expectedRevision: 0, visibility: "public" });
  const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  expect(published.ok).toBe(true);
  expect(await t.query(api.learnFrontend.embeddedFlashcards, { setId })).toEqual({ title: "Recall", cardCount: 1 });
  await owner.mutation(api.flashcards.setLifecycle, { setId, expectedRevision: 1, action: "unpublish" });
  expect(await t.query(api.learnFrontend.embeddedFlashcards, { setId })).toBeNull();
  expect(await t.query(api.learnFrontend.embeddedFlashcards, { setId: "invalid" })).toBeNull();
});
