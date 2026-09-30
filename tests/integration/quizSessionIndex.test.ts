import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, questionFixtures, quizFixture } from "../fixtures";

/** Completed-attempt reads go through by_quizId_and_status_and_score; results must match a full scan. */
async function setup(attempts: { score: number; status?: "completed" | "in_progress" }[]) {
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const ids = await t.run(async (ctx) => {
    const quizId = await ctx.db.insert("quizzes", { ...quizFixture, creatorId: creatorIdentity.subject, creatorUsername: creatorIdentity.nickname });
    await ctx.db.insert("questions", { ...questionFixtures.mcq, quizId });
    const sessionIds = [];
    for (const [i, a] of attempts.entries()) {
      sessionIds.push(await ctx.db.insert("quizSessions", {
        quizId, playerName: `P${i}`, status: a.status ?? "completed", score: a.score, totalPoints: 10, answers: [],
        startedAt: 1_700_000_000_000 + i, completedAt: a.status === "in_progress" ? undefined : 1_700_000_100_000 + i,
      }));
    }
    return { quizId, sessionIds };
  });
  return { t, owner, ...ids };
}

describe("response folders via the spam index", () => {
  it("lists the inbox and the spam folder newest first, with the reviewed filter", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const formId = await owner.mutation(api.forms.createForm, { title: "Folders" });
    const rows = [
      { spam: false, reviewed: false }, { spam: true, reviewed: false }, { spam: false, reviewed: true }, { spam: true, reviewed: true },
    ];
    const ids = await t.run(async (ctx) => Promise.all(rows.map((r, i) => ctx.db.insert("formResponses", {
      formId, version: 1, status: "completed", answers: {}, language: "en", submissionKey: `k${i}`, receiptCode: `R${i}`,
      startedAt: 1_000 + i, submittedAt: 2_000 + i, updatedAt: 2_000 + i, tags: [], searchText: "", ...r,
    }))));
    const list = async (filter: { spam?: boolean; reviewed?: boolean }) =>
      (await owner.query(api.formResults.listResponses, { formId, filter, paginationOpts: { numItems: 10, cursor: null } })).page.map((r) => r._id);
    expect(await list({})).toEqual([ids[2], ids[0]]);
    expect(await list({ spam: true })).toEqual([ids[3], ids[1]]);
    expect(await list({ reviewed: false })).toEqual([ids[0]]);
    expect(await list({ spam: true, reviewed: true })).toEqual([ids[3]]);
  });
});

describe("completed quiz attempts via the status index", () => {
  it("keeps every higher-score tie and fills the cutoff with the oldest attempts", async () => {
    const attempts = [
      ...Array.from({ length: 7 }, () => ({ score: 10 })),
      ...Array.from({ length: 6 }, () => ({ score: 8 })),
      ...Array.from({ length: 100 }, () => ({ score: 5 })),
      ...Array.from({ length: 3 }, () => ({ score: 1 })),
    ];
    const { t, quizId } = await setup(attempts);
    const board = await t.query(api.quizFunctions.getQuizLeaderboard, { quizId });
    expect(board.map((r) => r.playerName)).toEqual(Array.from({ length: 20 }, (_, i) => `P${i}`));
    expect(board.map((r) => r.score)).toEqual([...Array(7).fill(10), ...Array(6).fill(8), ...Array(7).fill(5)]);
  });

  it("ranks the leaderboard by score with ties oldest first, ignoring attempts in progress", async () => {
    // 25 completed attempts: five at 9, then twenty tied at 5 (so the 20th place is a tie), plus in-progress ones.
    const attempts = [
      ...Array.from({ length: 5 }, () => ({ score: 9 })),
      ...Array.from({ length: 20 }, () => ({ score: 5 })),
      { score: 10, status: "in_progress" as const },
      { score: 10, status: "in_progress" as const },
    ];
    const { t, quizId } = await setup(attempts);
    const board = await t.query(api.quizFunctions.getQuizLeaderboard, { quizId });
    expect(board).toHaveLength(20);
    expect(board.map((r) => r.playerName)).toEqual([...Array.from({ length: 5 }, (_, i) => `P${i}`), ...Array.from({ length: 15 }, (_, i) => `P${i + 5}`)]);
  });

  it("counts and averages only completed attempts in the library and results", async () => {
    const { owner, quizId, sessionIds } = await setup([{ score: 10 }, { score: 5 }, { score: 0, status: "in_progress" }]);
    const [mine] = await owner.query(api.quizFunctions.getMyQuizzes, {});
    expect(mine.sessionCount).toBe(2);
    expect(mine.avgScore).toBe(75);
    expect(mine).not.toHaveProperty("publishedSnapshot");
    const sessions = await owner.query(api.quizFunctions.getQuizSessions, { quizId });
    expect(sessions.map((s) => s._id)).toEqual([sessionIds[1], sessionIds[0]]);
    expect((await owner.query(api.quizFunctions.getQuizDeletionImpact, { quizId }))?.responseCount).toBe(2);
    expect(await owner.query(api.quizFunctions.getPlayerPercentile, { sessionId: sessionIds[0] })).toBe(100);
    const stats = await owner.query(api.quizFunctions.getQuizStatsEnhanced, { quizId });
    expect(stats?.top3.map((s) => s.playerName)).toEqual(["P0", "P1"]);
  });
});
