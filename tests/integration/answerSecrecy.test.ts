import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createTestConvex } from "./setup";
import { creatorIdentity, questionFixtures, quizFixture } from "../fixtures";

async function seedQuizWithQuestions(t: ReturnType<typeof createTestConvex>) {
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
        hint: `${key} hint`,
      });
    }

    return { quizId, questionIds };
  });
}

async function seedSession(
  t: ReturnType<typeof createTestConvex>,
  quizId: Id<"quizzes">
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("quizSessions", {
      quizId,
      playerName: "Anonymous Respondent",
      status: "in_progress",
      score: 0,
      totalPoints: 0,
      answers: [],
      startedAt: Date.now(),
    });
  });
}

describe("respondent answer secrecy", () => {
  it("keeps grading fields out of the anonymous projection for every question type", async () => {
    const t = createTestConvex();
    const { quizId } = await seedQuizWithQuestions(t);

    const playerQuiz = await t.query(api.quizFunctions.getQuizForPlayer, { quizId });
    expect(playerQuiz?.questions).toHaveLength(4);

    const allowedKeys = new Set([
      "_id",
      "type",
      "questionText",
      "options",
      "points",
      "timeLimit",
      "order",
    ]);

    for (const question of playerQuiz?.questions ?? []) {
      expect(Object.keys(question).filter((key) => !allowedKeys.has(key))).toEqual([]);
      expect(question).not.toHaveProperty("correctAnswer");
      expect(question).not.toHaveProperty("correctAnswers");
      expect(question).not.toHaveProperty("keywords");
      expect(question).not.toHaveProperty("hint");
      expect(question).not.toHaveProperty("explanation");
    }

    await expect(
      t.query(api.quizFunctions.getQuestionsForOwner, { quizId })
    ).resolves.toEqual([]);
  });

  it("preserves full grading data for the owner", async () => {
    const t = createTestConvex();
    const { quizId } = await seedQuizWithQuestions(t);

    const questions = await t
      .withIdentity(creatorIdentity)
      .query(api.quizFunctions.getQuestionsForOwner, { quizId });

    expect(questions).toHaveLength(4);
    expect(questions.find((q) => q.type === "mcq")?.correctAnswer).toBe("4");
    expect(questions.find((q) => q.type === "true_false")?.correctAnswer).toBe("true");
    expect(questions.find((q) => q.type === "multi_select")?.correctAnswers).toEqual([
      "Red",
      "Yellow",
      "Blue",
    ]);
    expect(questions.find((q) => q.type === "written")?.keywords).toEqual([
      "sunlight",
      "chlorophyll",
      "glucose",
    ]);
    expect(questions.every((q) => q.hint !== undefined)).toBe(true);
    expect(questions.every((q) => q.explanation !== undefined)).toBe(true);
  });

  it("uses teacher settings when quiz reveal settings are unset", async () => {
    const t = createTestConvex();
    const { quizId, questionIds } = await seedQuizWithQuestions(t);
    const sessionId = await seedSession(t, quizId);

    await t.run(async (ctx) => {
      await ctx.db.insert("teacherSettings", {
        clerkId: creatorIdentity.subject,
        showCorrectAnswers: false,
        showExplanations: false,
      });
    });

    const result = await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId: questionIds.mcq,
      answer: "4",
    });

    expect(result.correctAnswer).toBeUndefined();
    expect(result.explanation).toBeUndefined();
  });

  it("uses global settings when quiz and teacher reveal settings are unset", async () => {
    const t = createTestConvex();
    const { quizId, questionIds } = await seedQuizWithQuestions(t);
    const sessionId = await seedSession(t, quizId);

    await t.run(async (ctx) => {
      await ctx.db.insert("globalConfig", {
        showCorrectAnswers: false,
        showExplanations: false,
      });
    });

    const result = await t.mutation(api.quizFunctions.gradeAnswer, {
      sessionId,
      questionId: questionIds.mcq,
      answer: "4",
    });

    expect(result.correctAnswer).toBeUndefined();
    expect(result.explanation).toBeUndefined();
  });
});
