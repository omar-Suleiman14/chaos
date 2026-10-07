import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex, createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, otherCreatorIdentity, questionFixtures, quizFixture } from "../fixtures";

afterEach(() => { vi.useRealTimers(); });

async function quizWithQuestion(t: ReturnType<typeof createTestConvex>, timeLimit?: number) {
  await t.withIdentity(creatorIdentity).mutation(api.quizFunctions.getOrCreateUser, {});
  return await t.run(async (ctx) => {
    const quizId = await ctx.db.insert("quizzes", { ...quizFixture, creatorId: creatorIdentity.subject, creatorUsername: creatorIdentity.nickname });
    const questionId = await ctx.db.insert("questions", { ...questionFixtures.mcq, quizId, ...(timeLimit ? { timeLimit } : {}) });
    return { quizId, questionId };
  });
}

describe("quiz attempt cap", () => {
  it("counts the player's own in-progress attempts, however many others are playing", async () => {
    const t = createTestConvex();
    const { quizId } = await quizWithQuestion(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 40; i++) {
        await ctx.db.insert("quizSessions", { quizId, playerName: `Other ${i}`, playerKey: `other ${i}`, status: "in_progress", score: 0, totalPoints: 0, answers: [], startedAt: Date.now() - 3_600_000 });
      }
    });
    for (let i = 0; i < 5; i++) await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Sam" });
    await expect(t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "sam" })).rejects.toThrow(/CAP_REACHED/);
    await expect(t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Alex" })).resolves.toBeTruthy();
  });
});

describe("server-side question time limits", () => {
  it("grades an answer after the limit as no answer, timed from when the server opened the question", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const t = createTestConvex();
    const { quizId, questionId } = await quizWithQuestion(t, 10);
    const sessionId = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Slow" });
    await t.mutation(api.quizFunctions.openQuestion, { sessionId, questionId });
    vi.setSystemTime(1_800_000_000_000 + 60_000);
    // A paused browser timer reports a tiny time; the server ignores it.
    const result = await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId, answer: "4", timeTaken: 1 });
    expect(result).toMatchObject({ isCorrect: false, pointsEarned: 0 });
    const session = await t.run((ctx) => ctx.db.get(sessionId));
    expect(session?.answers[0]).toMatchObject({ late: true, answer: "", timeTaken: 60 });
  });

  it("accepts an answer inside the limit and never moves the start later", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const t = createTestConvex();
    const { quizId, questionId } = await quizWithQuestion(t, 10);
    const sessionId = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Quick" });
    await t.mutation(api.quizFunctions.openQuestion, { sessionId, questionId });
    vi.setSystemTime(1_800_000_000_000 + 8_000);
    await t.mutation(api.quizFunctions.openQuestion, { sessionId, questionId });
    vi.setSystemTime(1_800_000_000_000 + 9_000);
    const result = await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId, answer: "4" });
    expect(result).toMatchObject({ isCorrect: true, pointsEarned: questionFixtures.mcq.points });
  });

  it("times questions never reported as opened from the attempt's start", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const t = createTestConvex();
    const { quizId, questionId } = await quizWithQuestion(t, 10);
    const sessionId = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Script" });
    vi.setSystemTime(1_800_000_000_000 + 120_000);
    const result = await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId, answer: "4" });
    expect(result).toMatchObject({ isCorrect: false, pointsEarned: 0 });
  });
});

describe("percentile on large quizzes", () => {
  it("ranks against every attempt, not only the lowest 500 scores", async () => {
    const t = createTestConvex();
    const { quizId } = await quizWithQuestion(t);
    const mine = await t.run(async (ctx) => {
      for (let i = 0; i < 600; i++) {
        await ctx.db.insert("quizSessions", { quizId, playerName: `P${i}`, status: "completed", score: i % 10, totalPoints: 10, answers: [], startedAt: i, completedAt: i });
      }
      return await ctx.db.insert("quizSessions", { quizId, playerName: "Me", status: "completed", score: 5, totalPoints: 10, answers: [], startedAt: 700, completedAt: 700 });
    });
    // 300 of the 600 others scored below 5.
    expect(await t.query(api.quizFunctions.getPlayerPercentile, { sessionId: mine })).toBe(50);
  });
});

describe("CRM follow-up search", () => {
  it("matches words and prefixes of names, not only the exact name", async () => {
    const t = await createTestConvexWithAdmin(otherCreatorIdentity.subject);
    const admin = t.withIdentity(otherCreatorIdentity);
    const base = { email: "", organization: "", stage: "new" as const, owner: "", source: "" };
    await admin.mutation(api.admin.saveContact, { ...base, name: "Omar Suleiman", email: "omar@example.com", nextFollowUp: 1_900_000_000_000 });
    await admin.mutation(api.admin.saveContact, { ...base, name: "Omar Without Followup", email: "o2@example.com" });
    await admin.mutation(api.admin.saveContact, { ...base, name: "Omar Closed", email: "o3@example.com", stage: "closed", nextFollowUp: 1_900_000_000_000 });
    const page = await admin.query(api.admin.contacts, { paginationOpts: { numItems: 25, cursor: null }, followUps: true, search: "omar" });
    expect(page.page.map((c) => c.name)).toEqual(["Omar Suleiman"]);
  });
});

describe("tag-filtered response pages", () => {
  it("scans past a page of non-matching responses to find tagged ones", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const formId = await owner.mutation(api.forms.createForm, { title: "Tags" });
    await t.run(async (ctx) => {
      for (let i = 0; i < 60; i++) {
        await ctx.db.insert("formResponses", {
          formId, version: 1, status: "completed", answers: {}, language: "en", submissionKey: `k${i}`, receiptCode: `R${i}`,
          startedAt: 1_000 + i, submittedAt: 2_000 + i, updatedAt: 2_000 + i, tags: i === 0 ? ["rare"] : [], searchText: "", spam: false, reviewed: false,
        });
      }
    });
    const result = await owner.query(api.formResults.listResponses, { formId, filter: { tag: "rare" }, paginationOpts: { numItems: 25, cursor: null } });
    expect(result.page.map((r) => r.receiptCode)).toEqual(["R0"]);
    expect(result.isDone).toBe(true);
  });
});
