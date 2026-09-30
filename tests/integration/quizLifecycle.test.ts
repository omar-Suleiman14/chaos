import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, otherCreatorIdentity, questionFixtures, quizFixture, sessionFixtures } from "../fixtures";

const adminIdentity = {
  ...otherCreatorIdentity,
  subject: "user_lifecycle_admin",
  tokenIdentifier: "https://chaos.test.clerk.accounts.dev|user_lifecycle_admin",
  email: "lifecycle-admin@example.com",
};

/** A quiz with an active and a soft-deleted question, both session states, and an AI job. */
async function seedPopulatedQuiz() {
  const t = await createTestConvexWithAdmin(adminIdentity.subject);
  const owner = t.withIdentity(creatorIdentity);
  const admin = t.withIdentity(adminIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const ids = await t.run(async (ctx) => {
    const quizId = await ctx.db.insert("quizzes", {
      ...quizFixture,
      creatorId: creatorIdentity.subject,
      creatorUsername: creatorIdentity.nickname,
    });
    const otherQuizId = await ctx.db.insert("quizzes", {
      ...quizFixture,
      slug: "other-quiz",
      creatorId: creatorIdentity.subject,
      creatorUsername: creatorIdentity.nickname,
    });
    const q1 = await ctx.db.insert("questions", { ...questionFixtures.mcq, quizId });
    const q2 = await ctx.db.insert("questions", { ...questionFixtures.trueFalse, quizId, deletedAt: 5 });
    const otherQuestion = await ctx.db.insert("questions", { ...questionFixtures.mcq, quizId: otherQuizId });
    const base = { score: 10, totalPoints: 10 };
    const done = await ctx.db.insert("quizSessions", { ...sessionFixtures.completed, ...base, quizId, playerName: "Done" });
    // Legacy documents have no status at all.
    const { status: _status, ...noStatus } = sessionFixtures.inProgress;
    void _status;
    const legacy = await ctx.db.insert("quizSessions", { ...noStatus, ...base, quizId, playerName: "Legacy" });
    const running = await ctx.db.insert("quizSessions", { ...sessionFixtures.inProgress, ...base, quizId, playerName: "Running" });
    const otherSession = await ctx.db.insert("quizSessions", {
      ...sessionFixtures.completed,
      ...base,
      quizId: otherQuizId,
      playerName: "Elsewhere",
    });
    const job = await ctx.db.insert("aiJobs", {
      clerkId: creatorIdentity.subject,
      status: "done",
      quizId,
      createdAt: 1,
    });
    const otherJob = await ctx.db.insert("aiJobs", {
      clerkId: creatorIdentity.subject,
      status: "done",
      quizId: otherQuizId,
      createdAt: 1,
    });
    return { quizId, otherQuizId, q1, q2, otherQuestion, done, legacy, running, otherSession, job, otherJob };
  });
  return { t, owner, admin, ...ids };
}

async function expectNoOrphans(t: Awaited<ReturnType<typeof seedPopulatedQuiz>>["t"], quizId: string) {
  const rows = await t.run(async (ctx) => ({
    quizzes: (await ctx.db.query("quizzes").collect()).filter((r) => r._id === quizId),
    questions: (await ctx.db.query("questions").collect()).filter((r) => r.quizId === quizId),
    sessions: (await ctx.db.query("quizSessions").collect()).filter((r) => r.quizId === quizId),
    jobs: (await ctx.db.query("aiJobs").collect()).filter((r) => r.quizId === quizId),
  }));
  expect(rows).toEqual({ quizzes: [], questions: [], sessions: [], jobs: [] });
}

describe("quiz deletion lifecycle", () => {
  it("owner deletion removes the quiz, every question (including soft-deleted), every session, and detaches AI jobs", async () => {
    const { t, owner, quizId, otherQuizId, otherQuestion, otherSession, job, otherJob } = await seedPopulatedQuiz();

    await owner.mutation(api.quizFunctions.deleteQuiz, { quizId });

    await expectNoOrphans(t, quizId);
    // The job is retained for history but no longer points at the deleted quiz.
    const jobRow = await t.run((ctx) => ctx.db.get(job));
    expect(jobRow).not.toBeNull();
    expect(jobRow?.quizId).toBeUndefined();
    // Nothing belonging to another quiz was touched.
    const survivors = await t.run(async (ctx) => ({
      quiz: await ctx.db.get(otherQuizId),
      question: await ctx.db.get(otherQuestion),
      session: await ctx.db.get(otherSession),
      job: await ctx.db.get(otherJob),
    }));
    expect(survivors.quiz).not.toBeNull();
    expect(survivors.question).not.toBeNull();
    expect(survivors.session).not.toBeNull();
    expect(survivors.job?.quizId).toBe(otherQuizId);
  });

  it("administrator deletion has identical data behaviour to owner deletion", async () => {
    const { t, admin, quizId, job } = await seedPopulatedQuiz();

    await admin.mutation(api.quizFunctions.adminDeleteQuiz, { quizId });

    await expectNoOrphans(t, quizId);
    expect((await t.run((ctx) => ctx.db.get(job)))?.quizId).toBeUndefined();
  });

  it("retires the public URL and lets the slug be reused", async () => {
    const { t, owner, quizId } = await seedPopulatedQuiz();
    const lookup = () =>
      t.query(api.quizFunctions.getQuizByUsernameSlug, { username: creatorIdentity.nickname, slug: quizFixture.slug });
    expect(await lookup()).not.toBeNull();

    await owner.mutation(api.quizFunctions.deleteQuiz, { quizId });
    expect(await lookup()).toBeNull();
    expect(await t.query(api.quizFunctions.getQuizForPlayer, { quizId })).toBeNull();
    await expect(
      t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Late" })
    ).rejects.toThrow("QUIZ_NOT_FOUND");
  });

  it("does not let another creator or an anonymous caller delete the quiz", async () => {
    const { t, quizId } = await seedPopulatedQuiz();
    const rival = t.withIdentity(otherCreatorIdentity);
    await rival.mutation(api.quizFunctions.getOrCreateUser, {});
    await expect(rival.mutation(api.quizFunctions.deleteQuiz, { quizId })).rejects.toThrow();
    await expect(t.mutation(api.quizFunctions.deleteQuiz, { quizId })).rejects.toThrow();
    await expect(rival.mutation(api.quizFunctions.adminDeleteQuiz, { quizId })).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.get(quizId))).not.toBeNull();
  });

  it("reports the number of completed responses that deletion will destroy", async () => {
    const { owner, quizId } = await seedPopulatedQuiz();
    const impact = await owner.query(api.quizFunctions.getQuizDeletionImpact, { quizId });
    // One completed session; the in-progress and legacy no-status sessions are not responses.
    expect(impact).toEqual({ title: quizFixture.title, questionCount: 1, responseCount: 1 });
  });

  it("only shows the deletion impact to the owner", async () => {
    const { t, quizId } = await seedPopulatedQuiz();
    const rival = t.withIdentity(otherCreatorIdentity);
    expect(await rival.query(api.quizFunctions.getQuizDeletionImpact, { quizId })).toBeNull();
    expect(await t.query(api.quizFunctions.getQuizDeletionImpact, { quizId })).toBeNull();
  });
});

describe("question deletion lifecycle", () => {
  it("soft-deletes a question so existing results stay interpretable", async () => {
    const { t, owner, quizId, q1 } = await seedPopulatedQuiz();
    const sessionId = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Answerer" });
    await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId: q1, answer: "4" });
    await t.mutation(api.quizFunctions.completeQuizSession, { sessionId });

    await owner.mutation(api.quizFunctions.deleteQuestion, { questionId: q1 });

    // The row still exists, marked deleted, so history can resolve it.
    const row = await t.run((ctx) => ctx.db.get(q1));
    expect(row?.deletedAt).toBeTypeOf("number");
    // It disappears from the editor and counts. A published quiz keeps serving its
    // frozen published revision to respondents until the creator republishes.
    expect(await owner.query(api.quizFunctions.getQuestionsForOwner, { quizId })).toEqual([]);
    const player = await t.query(api.quizFunctions.getQuizForPlayer, { quizId });
    expect(player?.questions.map((q) => q._id)).toEqual([q1]);
    const mine = await owner.query(api.quizFunctions.getMyQuizzes, {});
    expect(mine.find((q) => q._id === quizId)?.questionCount).toBe(0);
    // The recorded result still shows the original question text and grade.
    const detail = await owner.query(api.quizFunctions.getSessionDetail, { sessionId });
    expect(detail?.answerDetails).toHaveLength(1);
    expect(detail?.answerDetails[0].questionText).toBe(questionFixtures.mcq.questionText);
    expect(detail?.answerDetails[0].isCorrect).toBe(true);
    expect(detail?.score).toBe(10);
  });

  it("removes soft-deleted questions permanently only when the quiz is deleted", async () => {
    const { t, owner, quizId, q1 } = await seedPopulatedQuiz();
    await owner.mutation(api.quizFunctions.deleteQuestion, { questionId: q1 });
    expect(await t.run((ctx) => ctx.db.get(q1))).not.toBeNull();
    await owner.mutation(api.quizFunctions.deleteQuiz, { quizId });
    expect(await t.run((ctx) => ctx.db.get(q1))).toBeNull();
  });
});
