import { describe, expect, it } from "vitest";
import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DurableLibraryClient } from "../../lib/learn/libraryClient";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

async function setup() {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), other = t.withIdentity(otherCreatorIdentity);
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Library", description: "", tags: [], language: "en" }, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "A  😀\nB", citations: [], conceptIds: [] }] } });
  const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  if (!published.ok) throw new Error("Publication failed");
  const client = new DurableLibraryClient({ query: other.query, mutation: other.mutation } as Pick<ConvexReactClient, "query" | "mutation">);
  return { t, owner, other, client, lessonId, versionId: published.versionId };
}

describe("durable library client and private read adapters", () => {
  it("recovers only caller annotations after reload and source revocation", async () => {
    const { owner, other, client, lessonId } = await setup();
    await client.put({ key: "note1", lessonId, blockId: "p", kind: "note", note: "Private" });
    expect((await owner.query(api.learnLibrary.annotations, { paginationOpts: { numItems: 25, cursor: null } })).page).toEqual([]);
    await owner.mutation(api.lessons.setLifecycle, { lessonId, expectedRevision: 1, action: "unpublish" });
    const rows = (await other.query(api.learnLibrary.annotations, { paginationOpts: { numItems: 25, cursor: null } })).page;
    expect(rows[0].note).toBe("Private");
    const reloaded = new DurableLibraryClient({ query: other.query, mutation: other.mutation } as Pick<ConvexReactClient, "query" | "mutation">);
    reloaded.observe(rows);
    await reloaded.remove("note1");
    expect((await other.query(api.learnLibrary.annotations, { paginationOpts: { numItems: 25, cursor: null } })).page[0].deleted).toBe(true);
  });
  it("preserves raw whitespace and UTF-16 offsets, rejects normalized selections", async () => {
    const { client, other, lessonId } = await setup();
    await client.put({ key: "hl_yellow_1", lessonId, blockId: "p", kind: "highlight", anchor: { start: 1, end: 7, quote: "  😀\nB" } });
    expect((await other.query(api.learnLibrary.annotations, { paginationOpts: { numItems: 25, cursor: null } })).page[0].anchor?.quote).toBe("  😀\nB");
    await expect(client.put({ key: "hl_bad", lessonId, blockId: "p", kind: "highlight", anchor: { start: 1, end: 7, quote: " 😀 B" } })).rejects.toThrow("UTF-16");
  });
  it("surfaces stale revisions without adopting another device's revision", async () => {
    const { client, other, lessonId, versionId } = await setup();
    await client.put({ key: "note1", lessonId, blockId: "p", kind: "note", note: "First" });
    await other.mutation(api.learnPersonal.put, { key: "note1", lessonId, versionId, blockId: "p", kind: "note", note: "Other device", expectedRevision: 1 });
    client.observe((await other.query(api.learnLibrary.annotations, { paginationOpts: { numItems: 25, cursor: null } })).page);
    await expect(client.put({ key: "note1", lessonId, blockId: "p", kind: "note", note: "Stale" })).rejects.toThrow("REVISION_CONFLICT");
    await expect(client.put({ key: "note1", lessonId, blockId: "p", kind: "note", note: "Retry" })).rejects.toThrow("REVISION_CONFLICT");
    expect((await other.query(api.learnLibrary.annotations, { paginationOpts: { numItems: 25, cursor: null } })).page[0].note).toBe("Other device");
  });
  it("rejects oversized, fractional and zero page sizes on every new list", async () => {
    const { owner } = await setup();
    for (const ref of [api.learnLibrary.annotations, api.learnLibrary.folders, api.learnLibrary.members, api.learnLibrary.flashcards, api.learnLibrary.collections]) {
      for (const numItems of [0, 101, 1.5]) await expect(owner.query(ref, { paginationOpts: { numItems, cursor: null } })).rejects.toThrow("1..100");
    }
  });
  it("never exposes editable flashcard text to a public reader", async () => {
    const { t, owner } = await setup();
    const setId = await owner.mutation(api.flashcards.create, { title: "Published", cards: [{ id: "card", front: "Public", back: "Answer", conceptIds: [] }] });
    await owner.mutation(api.flashcards.publish, { setId, expectedRevision: 0, visibility: "public" });
    await owner.mutation(api.flashcards.save, { setId, expectedRevision: 1, title: "Private draft", cards: [{ id: "card", front: "Secret draft", back: "Answer", conceptIds: [] }] });
    const row = await t.query(api.learnLibrary.flashcard, { id: setId });
    expect(row?.title).toBe("Published"); expect(row?.cards[0].front).toBe("Public");
    expect((await owner.query(api.learnLibrary.flashcard, { id: setId }))?.title).toBe("Private draft");
  });
});
