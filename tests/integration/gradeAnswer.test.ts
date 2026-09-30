import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createTestConvex } from "./setup";
import { creatorIdentity, questionFixtures, quizFixture, sessionFixtures } from "../fixtures";

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

    const sessionId = await ctx.db.insert("quizSessions", { ...sessionFixtures.inProgress, quizId, startedAt: Date.now() });

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

    // 2 of 3 keywords matched (67%, at or above the default 50%): half marks.
    expect(result.pointsEarned).toBe(5);
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

  async function addWritten(t: ReturnType<typeof createTestConvex>, quizId: Id<"quizzes">, keywords: string[], points = 10) {
    return await t.run(async (ctx) => ctx.db.insert("questions", { quizId, type: "written", questionText: "Q", keywords, points, order: 9 }));
  }

  it("matches keywords as whole words, not substrings", async () => {
    const t = createTestConvex();
    const { quizId, sessionId } = await seedQuiz(t);
    const q = await addWritten(t, quizId, ["cat"]);
    const r = await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId: q, answer: "concatenate" });
    expect(r.pointsEarned).toBe(0);
    expect(r.isCorrect).toBe(false);
  });

  it("matches Arabic keywords ignoring diacritics and letter variants", async () => {
    const t = createTestConvex();
    const { quizId, sessionId } = await seedQuiz(t);
    const q = await addWritten(t, quizId, ["الشمس", "الطاقة"]);
    const r = await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId: q, answer: "الشَّمْسُ مصدر الطاقه" });
    expect(r.isCorrect).toBe(true);
    expect(r.pointsEarned).toBe(10);
  });

  it("uses the creator's half-marks threshold", async () => {
    const t = createTestConvex();
    const { quizId, sessionId } = await seedQuiz(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("teacherSettings", { clerkId: creatorIdentity.subject, halfMarkThreshold: 80 } as never);
    });
    const q = await addWritten(t, quizId, ["a", "b", "c"], 5);
    const r = await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId: q, answer: "a b" }); // 67% < 80%
    expect(r.pointsEarned).toBe(0);
  });

  it("gives half marks, possibly .5, at the threshold", async () => {
    const t = createTestConvex();
    const { quizId, sessionId } = await seedQuiz(t);
    const q = await addWritten(t, quizId, ["a", "b"], 5);
    const r = await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId: q, answer: "a" });
    expect(r.pointsEarned).toBe(2.5);
    expect(r.isCorrect).toBe(false);
  });

  it("does not let duplicate multi-select values help", async () => {
    const t = createTestConvex();
    const { questionIds, sessionId } = await seedQuiz(t);
    const r = await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId: questionIds.multiSelect, answer: "Red, Red, Red" });
    expect(r.pointsEarned).toBe(0);
  });

  it("grades multi-select options that contain commas, in the JSON and the old comma format", async () => {
    const t = createTestConvex();
    const { quizId, sessionId } = await seedQuiz(t);
    const q = await t.run((ctx) => ctx.db.insert("questions", {
      quizId, type: "multi_select", questionText: "Pick", options: ["Paris, France", "Lyon", "Nice"],
      correctAnswers: ["Paris, France", "Lyon"], points: 4, order: 9,
    }));
    const r = await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId: q, answer: JSON.stringify(["Lyon", "Paris, France"]) });
    expect(r.pointsEarned).toBe(4);
    expect(r.correctAnswers).toEqual(["Paris, France", "Lyon"]);
    const q2 = await t.run((ctx) => ctx.db.insert("questions", {
      quizId, type: "multi_select", questionText: "Pick", options: ["Red", "Blue"], correctAnswers: ["Red", "Blue"], points: 2, order: 10,
    }));
    const s2 = await t.run((ctx) => ctx.db.insert("quizSessions", { ...sessionFixtures.inProgress, quizId, startedAt: Date.now() }));
    const old = await t.mutation(api.quizFunctions.gradeAnswer, { sessionId: s2, questionId: q2, answer: "Blue,Red" });
    expect(old.pointsEarned).toBe(2);
  });

  it("answers a question only once and rejects questions from another quiz", async () => {
    const t = createTestConvex();
    const { questionIds, sessionId } = await seedQuiz(t);
    await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId: questionIds.mcq, answer: "5" });
    const again = await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId: questionIds.mcq, answer: "4" });
    expect(again.alreadyAnswered).toBe(true);
    expect(again.pointsEarned).toBe(0);
    const other = await seedQuiz(t);
    await expect(
      t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId: other.questionIds.mcq, answer: "4" }),
    ).rejects.toThrow(/QUESTION_NOT_IN_QUIZ/);
    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session?.answers).toHaveLength(1);
    expect(session?.score).toBe(0);
  });
});
