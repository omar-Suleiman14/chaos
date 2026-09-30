import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, questionFixtures, quizFixture } from "../fixtures";

describe("AI retirement", () => {
  it("rejects stale public and internal AI calls without writing anything", async () => {
    const t = createTestConvex();
    const jobId = await t.run((ctx) => ctx.db.insert("aiJobs", { clerkId: creatorIdentity.subject, status: "pending", createdAt: 1 }));
    const owner = t.withIdentity(creatorIdentity);

    await expect(owner.mutation(api.aiQuizMutations.generateUploadUrl, {})).rejects.toThrow(/AI_FEATURE_RETIRED/);
    await expect(owner.mutation(api.aiQuizMutations.createAIJob, {})).rejects.toThrow(/AI_FEATURE_RETIRED/);
    await expect(owner.query(api.aiQuizMutations.getAIJob, { jobId })).rejects.toThrow(/AI_FEATURE_RETIRED/);
    await expect(t.mutation(internal.aiQuizMutations.updateAIJob, { jobId, status: "done" })).rejects.toThrow(/AI_FEATURE_RETIRED/);
    await expect(
      t.mutation(internal.aiQuizMutations.saveGeneratedQuiz, {
        clerkId: creatorIdentity.subject,
        title: "Generated",
        questions: [{ type: "mcq", questionText: "Q", options: ["a", "b"], answer: "a" }],
      })
    ).rejects.toThrow(/AI_FEATURE_RETIRED/);

    const state = await t.run(async (ctx) => ({
      quizzes: await ctx.db.query("quizzes").collect(),
      job: await ctx.db.get(jobId),
    }));
    expect(state.quizzes).toHaveLength(0);
    expect(state.job?.status).toBe("pending");
  });

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
