import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import {
  creatorIdentity,
  otherCreatorIdentity,
  questionFixtures,
  quizFixture,
} from "../fixtures";

const adminIdentity = {
  ...creatorIdentity,
  subject: "user_admin",
  tokenIdentifier: "https://chaos.test.clerk.accounts.dev|user_admin",
  email: "support@chaos.fail",
  nickname: "admin",
};

async function seedCreatorData(
  t: ReturnType<typeof createTestConvex>,
  options: { published?: boolean } = {}
) {
  return await t.run(async (ctx) => {
    const quizId = await ctx.db.insert("quizzes", {
      ...quizFixture,
      isPublished: options.published ?? true,
      creatorId: creatorIdentity.subject,
      creatorUsername: creatorIdentity.nickname,
    });
    const questionId = await ctx.db.insert("questions", {
      ...questionFixtures.mcq,
      quizId,
    });
    const sessionId = await ctx.db.insert("quizSessions", {
      quizId,
      playerName: "Player One",
      status: "completed",
      score: 10,
      totalPoints: 10,
      answers: [
        {
          questionId,
          answer: "4",
          isCorrect: true,
          pointsEarned: 10,
        },
      ],
      startedAt: 1_700_000_000_100,
      completedAt: 1_700_000_000_200,
    });
    const jobId = await ctx.db.insert("aiJobs", {
      clerkId: creatorIdentity.subject,
      status: "pending",
      createdAt: 1_700_000_000_300,
    });
    return { quizId, questionId, sessionId, jobId };
  });
}

describe("creator-owned data authorization", () => {
  it("blocks creator B from creator A quiz, question, session, analytics, and AI job operations", async () => {
    const t = createTestConvex();
    const { quizId, questionId, sessionId, jobId } = await seedCreatorData(t);
    const other = t.withIdentity(otherCreatorIdentity);

    await expect(other.query(api.quizFunctions.getQuiz, { quizId })).resolves.toBeNull();
    await expect(other.query(api.quizFunctions.getQuizForOwner, { quizId })).resolves.toBeNull();
    await expect(other.query(api.quizFunctions.getQuestions, { quizId })).resolves.toEqual([]);
    await expect(other.query(api.quizFunctions.getQuizSessions, { quizId })).resolves.toEqual([]);
    await expect(other.query(api.quizFunctions.getSessionDetail, { sessionId })).resolves.toBeNull();
    await expect(other.query(api.quizFunctions.getQuizStatsEnhanced, { quizId })).resolves.toBeNull();
    await expect(other.query(api.aiQuizMutations.getAIJob, { jobId })).resolves.toBeNull();

    await expect(
      other.mutation(api.quizFunctions.updateQuiz, { quizId, title: "Hijacked" })
    ).rejects.toThrow(/unauthorized/i);
    await expect(
      other.mutation(api.quizFunctions.deleteQuiz, { quizId })
    ).rejects.toThrow(/unauthorized/i);
    await expect(
      other.mutation(api.quizFunctions.addQuestion, {
        quizId,
        ...questionFixtures.mcq,
        order: 1,
      })
    ).rejects.toThrow(/unauthorized/i);
    await expect(
      other.mutation(api.quizFunctions.updateQuestion, {
        questionId,
        questionText: "Hijacked",
      })
    ).rejects.toThrow(/unauthorized/i);
    await expect(
      other.mutation(api.quizFunctions.deleteQuestion, { questionId })
    ).rejects.toThrow(/unauthorized/i);
    await expect(
      other.mutation(api.quizFunctions.overrideScore, {
        sessionId,
        questionId,
        newPoints: 0,
      })
    ).rejects.toThrow(/unauthorized/i);
    await expect(
      other.mutation(api.aiQuizMutations.cancelAIJob, { jobId })
    ).rejects.toThrow(/unauthorized/i);

    await expect(
      other.action(api.aiEditorChat.editQuizWithAI, {
        quizId,
        quizTitle: "Fixture Quiz",
        questions: [],
        message: "Rewrite this quiz",
      })
    ).rejects.toThrow(/unauthorized/i);

    await expect(
      other.action(api.aiQuiz.runAIQuizGeneration, {
        jobId,
        extractedText: "This text is deliberately long enough to pass the length check.",
        mode: "quiz",
        quizTitle: "Foreign job",
      })
    ).rejects.toThrow(/unauthorized/i);

    const stored = await t.run(async (ctx) => ({
      quiz: await ctx.db.get(quizId),
      question: await ctx.db.get(questionId),
      session: await ctx.db.get(sessionId),
      job: await ctx.db.get(jobId),
    }));
    expect(stored.quiz?.title).toBe(quizFixture.title);
    expect(stored.question?.questionText).toBe(questionFixtures.mcq.questionText);
    expect(stored.session?.score).toBe(10);
    expect(stored.job?.status).toBe("pending");
  });

  it("allows the owner and admin to read answer-bearing creator data", async () => {
    const t = createTestConvex();
    const { quizId } = await seedCreatorData(t);

    const ownerQuestions = await t
      .withIdentity(creatorIdentity)
      .query(api.quizFunctions.getQuestions, { quizId });
    const adminQuestions = await t
      .withIdentity(adminIdentity)
      .query(api.quizFunctions.getQuestions, { quizId });

    expect(ownerQuestions).toHaveLength(1);
    expect(ownerQuestions[0].correctAnswer).toBe("4");
    expect(adminQuestions).toHaveLength(1);
    expect(adminQuestions[0].correctAnswer).toBe("4");
  });

  it("keeps unpublished slug lookups private while preserving published anonymous routing", async () => {
    const privateTest = createTestConvex();
    const { quizId: privateQuizId } = await seedCreatorData(privateTest, { published: false });

    await expect(
      privateTest.query(api.quizFunctions.getQuizBySlug, { slug: quizFixture.slug })
    ).resolves.toBeNull();
    await expect(
      privateTest
        .withIdentity(otherCreatorIdentity)
        .query(api.quizFunctions.getQuizByUsernameSlug, {
          username: creatorIdentity.nickname,
          slug: quizFixture.slug,
        })
    ).resolves.toBeNull();

    const ownerPrivate = await privateTest
      .withIdentity(creatorIdentity)
      .query(api.quizFunctions.getQuizBySlug, { slug: quizFixture.slug });
    expect(ownerPrivate?._id).toBe(privateQuizId);

    const publishedTest = createTestConvex();
    const { quizId: publishedQuizId } = await seedCreatorData(publishedTest);
    const publicResult = await publishedTest.query(api.quizFunctions.getQuizByUsernameSlug, {
      username: creatorIdentity.nickname,
      slug: quizFixture.slug,
    });

    expect(publicResult?._id).toBe(publishedQuizId);
    expect(publicResult).not.toHaveProperty("creatorId");
    expect(publicResult).not.toHaveProperty("description");
  });

  it("does not let a respondent grade a question from another quiz through a valid session", async () => {
    const t = createTestConvex();
    const { quizId } = await seedCreatorData(t);
    const { sessionId, foreignQuestionId } = await t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("quizSessions", {
        quizId,
        playerName: "Player Two",
        status: "in_progress",
        score: 0,
        totalPoints: 0,
        answers: [],
        startedAt: 1_700_000_001_000,
      });
      const foreignQuizId = await ctx.db.insert("quizzes", {
        ...quizFixture,
        title: "Foreign Quiz",
        slug: "foreign-quiz",
        creatorId: otherCreatorIdentity.subject,
        creatorUsername: otherCreatorIdentity.nickname,
      });
      const foreignQuestionId = await ctx.db.insert("questions", {
        ...questionFixtures.mcq,
        quizId: foreignQuizId,
      });
      return { sessionId, foreignQuestionId };
    });

    await expect(
      t.mutation(api.quizFunctions.gradeAnswer, {
        sessionId,
        questionId: foreignQuestionId,
        answer: "4",
      })
    ).rejects.toThrow(/does not belong/i);
  });
});
