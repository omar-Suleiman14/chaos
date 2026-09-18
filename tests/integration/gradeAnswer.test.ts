import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createTestConvex } from "./setup";
import { creatorIdentity, questionFixtures, quizFixture } from "../fixtures";

async function seedQuiz(t: ReturnType<typeof createTestConvex>) {
  return await t.run(async (ctx) => {
    const quizId = await ctx.db.insert("quizzes", {
      ...quizFixture,
      creatorId: creatorIdentity.subject,
      creatorUsername: creatorIdentity.nickname,
    });

    const questionIds = {} as Record<keyof typeof questionFixtures, Id<"questions">>;
    for (const [key, question] of Object.entries(questionFixtures)) {
      questionIds[key as keyof typeof questionFixtures] = await ctx.db.insert("questions", {
        ...question,
        quizId,
      });
    }

    const sessionId = await ctx.db.insert("quizSessions", {
      quizId,
      playerName: "Anonymous Respondent",
      status: "in_progress",
      score: 0,
      totalPoints: 0,
      answers: [],
      startedAt: Date.now(),
    });

    return { quizId, questionIds, sessionId };
  });
}

describe("gradeAnswer", () => {
  it("grades a correct mcq answer for full marks", async () => {
    const t = createTestConvex();
    const { questionIds, sessionId } = await seedQuiz(t);

    const result = await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId: questionIds.mcq,
      answer: "4",
    });

    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(10);
  });

  it("grades an incorrect mcq answer for zero marks", async () => {
    const t = createTestConvex();
    const { questionIds, sessionId } = await seedQuiz(t);

    const result = await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId: questionIds.mcq,
      answer: "5",
    });

    expect(result.isCorrect).toBe(false);
    expect(result.pointsEarned).toBe(0);
  });

  it("grades a true/false answer case-insensitively", async () => {
    const t = createTestConvex();
    const { questionIds, sessionId } = await seedQuiz(t);

    const result = await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId: questionIds.trueFalse,
      answer: "TRUE",
    });

    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(10);
  });

  it("grades a multi-select answer regardless of option order", async () => {
    const t = createTestConvex();
    const { questionIds, sessionId } = await seedQuiz(t);

    const result = await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId: questionIds.multiSelect,
      answer: "Blue, red, yellow",
    });

    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(10);
  });

  it("marks a multi-select answer wrong when an option is missing", async () => {
    const t = createTestConvex();
    const { questionIds, sessionId } = await seedQuiz(t);

    const result = await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId: questionIds.multiSelect,
      answer: "Red, Yellow",
    });

    expect(result.isCorrect).toBe(false);
    expect(result.pointsEarned).toBe(0);
  });

  it("awards partial credit for a written answer matching some keywords", async () => {
    const t = createTestConvex();
    const { questionIds, sessionId } = await seedQuiz(t);

    const result = await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId: questionIds.written,
      answer: "Plants use sunlight and chlorophyll to grow.",
    });

    // 2 of 3 keywords ("sunlight", "chlorophyll") matched: round(10 * 2/3) = 7.
    expect(result.pointsEarned).toBe(7);
    expect(result.isCorrect).toBe(false);
    expect(result).not.toHaveProperty("keywords");
  });

  it("awards full marks for a written answer matching every keyword", async () => {
    const t = createTestConvex();
    const { questionIds, sessionId } = await seedQuiz(t);

    const result = await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId: questionIds.written,
      answer: "Sunlight, chlorophyll and glucose are all part of photosynthesis.",
    });

    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(10);
  });

  it("auto-awards full marks for a written question with no configured keywords", async () => {
    const t = createTestConvex();
    const { quizId, sessionId } = await seedQuiz(t);

    const noKeywordQuestionId = await t.run(async (ctx) => {
      return await ctx.db.insert("questions", {
        quizId,
        type: "written",
        questionText: "Describe your favorite season.",
        points: 5,
        order: 4,
      });
    });

    const result = await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId: noKeywordQuestionId,
      answer: "Anything at all.",
    });

    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(5);
  });

  it("accumulates score and totalPoints on the session across multiple answers", async () => {
    const t = createTestConvex();
    const { questionIds, sessionId } = await seedQuiz(t);

    await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId: questionIds.mcq,
      answer: "4",
    });
    await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId: questionIds.trueFalse,
      answer: "false",
    });

    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session?.score).toBe(10);
    expect(session?.totalPoints).toBe(20);
    expect(session?.answers).toHaveLength(2);
  });
});
