import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, questionFixtures, quizFixture } from "../fixtures";

// The AI generation endpoints are gone; content and results made with them stay readable.
describe("AI retirement", () => {
  it("keeps legacy AI-generated quizzes, questions and results readable", async () => {
    const t = createTestConvex();
    const { quizId } = await t.run(async (ctx) => {
      const quizId = await ctx.db.insert("quizzes", {
        ...quizFixture,
        isAiGenerated: true,
        creatorId: creatorIdentity.subject,
        creatorUsername: creatorIdentity.nickname,
      });
      const questionId = await ctx.db.insert("questions", { ...questionFixtures.mcq, quizId });
      await ctx.db.insert("quizSessions", {
        quizId, playerName: "Legacy", status: "completed", score: 10, totalPoints: 10,
        answers: [{ questionId, answer: "4", isCorrect: true, pointsEarned: 10 }], startedAt: 1, completedAt: 2,
      });
      return { quizId };
    });
    const owner = t.withIdentity(creatorIdentity);
    expect((await owner.query(api.quizFunctions.getQuizForOwner, { quizId }))?.title).toBe(quizFixture.title);
    expect(await owner.query(api.quizFunctions.getQuestionsForOwner, { quizId })).toHaveLength(1);
    expect(await owner.query(api.quizFunctions.getQuizSessions, { quizId })).toHaveLength(1);
  });
});
