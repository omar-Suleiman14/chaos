import { describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, questionFixtures, quizFixture } from "../fixtures";

async function seed(t: ReturnType<typeof createTestConvex>, overrides: Record<string, unknown> = {}) {
  return await t.run(async (ctx) => {
    const quizId = await ctx.db.insert("quizzes", {
      ...quizFixture,
      creatorId: creatorIdentity.subject,
      creatorUsername: creatorIdentity.nickname,
      isElevated: true,
      ...overrides,
    });
    const questionId = await ctx.db.insert("questions", { ...questionFixtures.written, quizId });
    return { quizId, questionId };
  });
}

describe("anonymous respondent session hardening", () => {
  it("lets an anonymous respondent start, answer and complete a published quiz with no account", async () => {
    const t = createTestConvex();
    const { quizId, questionId } = await seed(t);
    const sessionId = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Guest" });
    await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId, answer: "anything" });
    const result = await t.mutation(api.quizFunctions.completeQuizSession, { sessionId });
    expect(result.answers).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(sessionId)))?.status).toBe("completed");
  });

  it("keeps attempts with the same display name separate", async () => {
    const t = createTestConvex();
    const { quizId } = await seed(t);
    const a = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Guest" });
    const b = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Guest" });
    expect(b).not.toBe(a);
    expect(await t.run((ctx) => ctx.db.query("quizSessions").collect())).toHaveLength(2);
  });

  it("distinguishes missing, unpublished and banned quizzes with distinct error codes", async () => {
    const t = createTestConvex();
    const { quizId: unpublished } = await seed(t, { isPublished: false });
    const { quizId: banned } = await seed(t, { isBanned: true });
    const { quizId: gone } = await seed(t);
    await t.run((ctx) => ctx.db.delete(gone));

    await expect(t.mutation(api.quizFunctions.startQuizSession, { quizId: gone, playerName: "G" })).rejects.toThrow("QUIZ_UNAVAILABLE");
    await expect(t.mutation(api.quizFunctions.startQuizSession, { quizId: unpublished, playerName: "G" })).rejects.toThrow("QUIZ_UNAVAILABLE");
    await expect(t.mutation(api.quizFunctions.startQuizSession, { quizId: banned, playerName: "G" })).rejects.toThrow("QUIZ_UNAVAILABLE");
  });

  it("rate limits a burst of scripted session creations per quiz", async () => {
    const t = createTestConvex();
    const { quizId } = await seed(t);
    for (let i = 0; i < 30; i += 1) {
      await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: `Bot ${i}` });
    }
    await expect(
      t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Bot 31" })
    ).rejects.toThrow("RATE_LIMITED");
    expect(await t.run((ctx) => ctx.db.query("quizSessions").collect())).toHaveLength(30);

    // The limit is per quiz and per window: another quiz is unaffected, and the window expires.
    const { quizId: other } = await seed(t);
    await expect(t.mutation(api.quizFunctions.startQuizSession, { quizId: other, playerName: "Bot" })).resolves.toBeTruthy();
    vi.advanceTimersByTime(61_000);
    await expect(t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Human" })).resolves.toBeTruthy();
  });

  it("rejects oversized answers and too many answers per session, storing nothing", async () => {
    const t = createTestConvex();
    const { quizId, questionId } = await seed(t);
    const sessionId = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Guest" });
    await expect(
      t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId, answer: "x".repeat(5_001) })
    ).rejects.toThrow("ANSWER_TOO_LONG");
    expect((await t.run((ctx) => ctx.db.get(sessionId)))?.answers).toEqual([]);
    await expect(
      t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId, answer: "x".repeat(5_000) })
    ).resolves.toBeTruthy();

    const capped = await t.run(async (ctx) => {
      const ids = [];
      for (let i = 0; i < 200; i += 1) {
        ids.push(await ctx.db.insert("questions", { ...questionFixtures.written, quizId, order: i + 10 }));
      }
      return await ctx.db.insert("quizSessions", {
        quizId,
        playerName: "Capped",
        status: "in_progress",
        score: 0,
        totalPoints: 0,
        answers: ids.map((id) => ({ questionId: id, answer: "a", isCorrect: true, pointsEarned: 0 })),
        startedAt: Date.now(),
      });
    });
    await expect(
      t.mutation(api.quizFunctions.gradeAnswer, { sessionId: capped, questionId, answer: "b" })
    ).rejects.toThrow("TOO_MANY_ANSWERS");
  });

  it("normalises hostile and malformed names", async () => {
    const t = createTestConvex();
    const { quizId } = await seed(t);
    const start = async (playerName: string) => {
      const id = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName });
      return (await t.run((ctx) => ctx.db.get(id)))!.playerName;
    };

    expect(await start("  Ada \n\t  Lovelace  ")).toBe("Ada Lovelace");
    expect(await start("<script>alert(1)</script>Eve")).toBe("alert(1)Eve");
    expect(await start("Bi\u0000d​i‮e\u0007")).toBe("Bidie");
    expect(Array.from(await start("\u{1F600}".repeat(300))).length).toBeLessThanOrEqual(100);
    // Truncation must never split a surrogate pair into a lone surrogate.
    const cut = await start("a".repeat(99) + "\u{1F600}");
    expect(cut.isWellFormed()).toBe(true);
    await expect(t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "   " })).rejects.toThrow("NAME_REQUIRED");
    await expect(t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "<b></b>\u0000" })).rejects.toThrow("NAME_REQUIRED");
  });
});
