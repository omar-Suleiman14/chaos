import { describe, expect, it, vi, afterEach } from "vitest";
import { makeFunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
const review = makeFunctionReference<"mutation", { versionId: Id<"flashcardVersions">; cardId: string; rating: "again" | "hard" | "good" | "easy"; eventId: string; expectedRevision: number }, { revision: number; dueAt: number; box: number; replayed: boolean }>("flashcardStudy:review");
const schedule = makeFunctionReference<"query", { versionId: Id<"flashcardVersions">; now: number; limit?: number }, { evidenceKind: "self_reported"; items: { cardId: string; revision: number; reviews: number; lapses: number; box: number; dueAt: number | null; due: boolean }[] }>("flashcardStudy:reviewSchedule");
const history = makeFunctionReference<"query", { versionId: Id<"flashcardVersions">; before?: number }, { rating: string; reviewedAt: number }[]>("flashcardStudy:history");
const attach = makeFunctionReference<"mutation", { lessonId: Id<"lessons">; versionId: Id<"flashcardVersions">; label: string; order: number }, Id<"lessonFlashcards">>("flashcardStudy:attach");
const detach = makeFunctionReference<"mutation", { attachmentId: Id<"lessonFlashcards"> }, null>("flashcardStudy:detach");
const list = makeFunctionReference<"query", { lessonId: Id<"lessons"> }, { versionId: Id<"flashcardVersions">; title: string }[]>("flashcardStudy:listAttached");
const lifecycle = makeFunctionReference<"mutation", { setId: Id<"flashcardSets">; expectedRevision: number; action: "archive" | "restore" | "unpublish" }, number>("flashcards:setLifecycle");
const cards = [{ id: "c1", front: "Question", back: "Answer", conceptIds: [] }];
async function setup(visibility: "public" | "private" = "public") {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), student = t.withIdentity(otherCreatorIdentity);
  const setId = await owner.mutation(api.flashcards.create, { title: "Deck", cards });
  const versionId = await owner.mutation(api.flashcards.publish, { setId, expectedRevision: 0, visibility });
  return { t, owner, student, setId, versionId };
}
afterEach(() => vi.restoreAllMocks());
describe("durable flashcard review and attachments", () => {
  it("persists private evidence, retries once, rejects stale devices and isolates users", async () => {
    const { t, owner, student, versionId } = await setup();
    const args = { versionId, cardId: "c1", rating: "good" as const, eventId: "event1", expectedRevision: 0 };
    const result = await student.mutation(review, args);
    expect(result).toMatchObject({ revision: 1, box: 1, replayed: false });
    expect(await student.mutation(review, args)).toEqual({ ...result, replayed: true });
    await expect(student.mutation(review, { ...args, eventId: "event2" })).rejects.toThrow("REVISION_CONFLICT");
    await expect(student.mutation(review, { ...args, rating: "easy" })).rejects.toThrow("reused");
    expect(await student.query(history, { versionId })).toHaveLength(1);
    expect(await owner.query(history, { versionId })).toEqual([]);
    expect((await owner.query(schedule, { versionId, now: result.dueAt })).items[0].reviews).toBe(0);
    expect((await student.query(schedule, { versionId, now: result.dueAt - 1 })).items[0].due).toBe(false);
    expect((await student.query(schedule, { versionId, now: result.dueAt })).items[0].due).toBe(true);
    await expect(t.mutation(review, args)).rejects.toThrow("authenticated");
  });
  it("resets lapse interval from server time and never accepts fabricated cards", async () => {
    const { student, versionId } = await setup();
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const first = await student.mutation(review, { versionId, cardId: "c1", rating: "easy", eventId: "first", expectedRevision: 0 });
    expect(first.dueAt).toBe(1_800_000_000_000 + 3 * 86400000);
    await expect(student.mutation(review, { versionId, cardId: "missing", rating: "easy", eventId: "missing", expectedRevision: 0 })).rejects.toThrow("Card not found");
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_002_000);
    const second = await student.mutation(review, { versionId, cardId: "c1", rating: "again", eventId: "second", expectedRevision: 1 });
    expect(second).toMatchObject({ box: 0, revision: 2, dueAt: 1_800_000_602_000 });
    expect((await student.query(schedule, { versionId, now: second.dueAt })).items[0]).toMatchObject({ reviews: 2, lapses: 1 });
    await expect(student.query(schedule, { versionId, now: 1, limit: 101 })).rejects.toThrow("limit");
  });
  it("keeps versions independent and rechecks revoked access even on retries", async () => {
    const { owner, student, setId, versionId } = await setup();
    const args = { versionId, cardId: "c1", rating: "good" as const, eventId: "review", expectedRevision: 0 };
    await student.mutation(review, args);
    await owner.mutation(api.flashcards.save, { setId, expectedRevision: 1, title: "Changed", cards: [{ ...cards[0], back: "New answer" }] });
    const next = await owner.mutation(api.flashcards.publish, { setId, expectedRevision: 2, visibility: "public" });
    expect((await student.query(schedule, { versionId: next, now: 1 })).items[0].revision).toBe(0);
    await expect(student.mutation(review, args)).rejects.toThrow("unauthorized");
    expect(await owner.query(history, { versionId })).toEqual([]);
  });
  it("protects private decks and bans and preserves lifecycle history", async () => {
    const { t, owner, student, setId, versionId } = await setup("private");
    await expect(student.query(schedule, { versionId, now: 1 })).rejects.toThrow("unauthorized");
    await owner.mutation(review, { versionId, cardId: "c1", rating: "hard", eventId: "owner", expectedRevision: 0 });
    await expect(student.mutation(lifecycle, { setId, expectedRevision: 1, action: "archive" })).rejects.toThrow("unauthorized");
    await owner.mutation(lifecycle, { setId, expectedRevision: 1, action: "archive" });
    await expect(owner.query(schedule, { versionId, now: 1 })).rejects.toThrow("unauthorized");
    await owner.mutation(lifecycle, { setId, expectedRevision: 2, action: "restore" });
    expect(await owner.query(history, { versionId })).toHaveLength(1);
    const userId = await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    await t.run(async ctx => { await ctx.db.patch("users", userId, { isBanned: true }); });
    await expect(owner.mutation(review, { versionId, cardId: "c1", rating: "good", eventId: "banned", expectedRevision: 1 })).rejects.toThrow("ACCOUNT_BANNED");
  });
  it("pins attachments, enforces ownership, hides revoked decks and detaches idempotently", async () => {
    const { t, owner, student, setId, versionId } = await setup();
    const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Lesson", description: "", tags: [], language: "en" }, document: { schemaVersion: 1, blocks: [{ id: "intro", type: "paragraph", text: "Lesson", citations: [], conceptIds: [] }] } });
    await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
    const args = { lessonId, versionId, label: "Review", order: 0 };
    const attachmentId = await owner.mutation(attach, args);
    expect(await owner.mutation(attach, args)).toBe(attachmentId);
    expect(await t.query(list, { lessonId })).toEqual([expect.objectContaining({ versionId, title: "Deck" })]);
    await expect(student.mutation(attach, args)).rejects.toThrow("unauthorized");
    await expect(student.mutation(detach, { attachmentId })).rejects.toThrow("unauthorized");
    await owner.mutation(lifecycle, { setId, expectedRevision: 1, action: "unpublish" });
    expect(await t.query(list, { lessonId })).toEqual([]);
    expect(await owner.query(list, { lessonId })).toHaveLength(1);
    await owner.mutation(detach, { attachmentId });
    await owner.mutation(detach, { attachmentId });
    expect(await owner.query(list, { lessonId })).toEqual([]);
  });
  it("rate-limits new evidence atomically without consuming retries", async () => {
    const { t, student, versionId } = await setup();
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    await t.run(async ctx => { await ctx.db.insert("rateWindows", { key: "flashcards:review:" + otherCreatorIdentity.tokenIdentifier, windowStart: now - now % 60000, count: 120 }); });
    await expect(student.mutation(review, { versionId, cardId: "c1", rating: "good", eventId: "limited", expectedRevision: 0 })).rejects.toThrow("RATE_LIMITED");
    expect(await student.query(history, { versionId })).toEqual([]);
    expect((await student.query(schedule, { versionId, now })).items[0].revision).toBe(0);
  });

});
