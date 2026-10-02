import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, otherCreatorIdentity, questionFixtures, quizFixture } from "../fixtures";

const adminIdentity = {
  ...otherCreatorIdentity,
  subject: "user_moderation_admin",
  tokenIdentifier: "https://chaos.test.clerk.accounts.dev|user_moderation_admin",
  email: "moderation-admin@example.com",
};

async function setup() {
  const t = await createTestConvexWithAdmin(adminIdentity.subject);
  const owner = t.withIdentity(creatorIdentity);
  const admin = t.withIdentity(adminIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const seeded = await t.run(async (ctx) => {
    const quizId = await ctx.db.insert("quizzes", {
      ...quizFixture,
      creatorId: creatorIdentity.subject,
      creatorUsername: creatorIdentity.nickname,
    });
    const questionId = await ctx.db.insert("questions", { ...questionFixtures.mcq, quizId });
    return { quizId, questionId };
  });
  return { t, owner, admin, ...seeded };
}

describe("banned user (server enforcement)", () => {
  it("cannot create, update, publish, edit questions or delete, even by calling mutations directly", async () => {
    const { t, owner, admin, quizId, questionId } = await setup();
    await admin.mutation(api.quizFunctions.adminToggleUserBan, { clerkId: creatorIdentity.subject, ban: true });

    await expect(owner.mutation(api.quizFunctions.createQuiz, { title: "New" })).rejects.toThrow("ACCOUNT_BANNED");
    await expect(owner.mutation(api.quizFunctions.updateQuiz, { quizId, title: "Renamed" })).rejects.toThrow("ACCOUNT_BANNED");
    await expect(owner.mutation(api.quizFunctions.unpublishQuiz, { quizId })).rejects.toThrow("ACCOUNT_BANNED");
    await expect(owner.mutation(api.quizFunctions.publishQuiz, { quizId })).rejects.toThrow("ACCOUNT_BANNED");
    await expect(
      owner.mutation(api.quizFunctions.addQuestion, { quizId, ...questionFixtures.mcq })
    ).rejects.toThrow("ACCOUNT_BANNED");
    await expect(
      owner.mutation(api.quizFunctions.updateQuestion, { questionId, questionText: "Changed" })
    ).rejects.toThrow("ACCOUNT_BANNED");
    await expect(owner.mutation(api.quizFunctions.deleteQuestion, { questionId })).rejects.toThrow("ACCOUNT_BANNED");
    await expect(owner.mutation(api.quizFunctions.deleteQuiz, { quizId })).rejects.toThrow("ACCOUNT_BANNED");
    await expect(
      owner.mutation(api.quizFunctions.updateTeacherSettings, { defaultPointsPerQuestion: 5 })
    ).rejects.toThrow("ACCOUNT_BANNED");

    // Nothing was written or destroyed.
    const state = await t.run(async (ctx) => ({
      quiz: await ctx.db.get(quizId),
      question: await ctx.db.get(questionId),
    }));
    expect(state.quiz?.title).toBe(quizFixture.title);
    expect(state.question?.deletedAt).toBeUndefined();
  });

  it("keeps the account's data readable and lets an administrator unban it", async () => {
    const { owner, admin, quizId } = await setup();
    await admin.mutation(api.quizFunctions.adminToggleUserBan, { clerkId: creatorIdentity.subject, ban: true });

    expect(await owner.query(api.quizFunctions.getQuizForOwner, { quizId })).not.toBeNull();
    expect(await owner.query(api.quizFunctions.getMyQuizzes, {})).toHaveLength(1);

    await admin.mutation(api.quizFunctions.adminToggleUserBan, { clerkId: creatorIdentity.subject, ban: false });
    await expect(owner.mutation(api.quizFunctions.updateQuiz, { quizId, title: "Renamed" })).resolves.not.toThrow();
  });

  it("makes the owner's published quiz unavailable to respondents", async () => {
    const { t, admin, quizId } = await setup();
    await admin.mutation(api.quizFunctions.adminToggleUserBan, { clerkId: creatorIdentity.subject, ban: true });

    await expect(
      t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Student" })
    ).rejects.toThrow("QUIZ_UNAVAILABLE");
    expect(await t.query(api.quizFunctions.getQuizForPlayer, { quizId })).toBeNull();
  });
});

describe("banned quiz (respondent paths)", () => {
  it("is unavailable at its public URL, to players, sessions and the leaderboard", async () => {
    const { t, admin, quizId } = await setup();
    const inProgress = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Early Bird" });
    await admin.mutation(api.quizFunctions.adminToggleQuizBan, { quizId, ban: true });

    expect(
      await t.query(api.quizFunctions.getQuizByUsernameSlug, { username: creatorIdentity.nickname, slug: quizFixture.slug })
    ).toBeNull();
    expect(await t.query(api.quizFunctions.getQuizForPlayer, { quizId })).toBeNull();
    expect(await t.query(api.quizFunctions.getQuizLeaderboard, { quizId })).toEqual([]);
    await expect(
      t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Late Comer" })
    ).rejects.toThrow("QUIZ_UNAVAILABLE");
    await expect(
      t.mutation(api.quizFunctions.completeQuizSession, { sessionId: inProgress })
    ).rejects.toThrow("QUIZ_UNAVAILABLE");
  });

  it("rejects grading answers for an existing attempt", async () => {
    const { t, admin, quizId, questionId } = await setup();
    const sessionId = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Early Bird" });
    await admin.mutation(api.quizFunctions.adminToggleQuizBan, { quizId, ban: true });

    await expect(
      t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId, answer: "4" })
    ).rejects.toThrow("QUIZ_UNAVAILABLE");
    const session = await t.run((ctx) => ctx.db.get(sessionId));
    expect(session?.answers).toEqual([]);
  });

  it("stays visible to its owner and to administrators, and is restored when unbanned", async () => {
    const { t, owner, admin, quizId } = await setup();
    await admin.mutation(api.quizFunctions.adminToggleQuizBan, { quizId, ban: true });

    const mine = await owner.query(api.quizFunctions.getMyQuizzes, {});
    expect(mine.map((q) => q._id)).toEqual([quizId]);
    expect(mine[0].isBanned).toBe(true);
    expect(await owner.query(api.quizFunctions.getQuizForPlayer, { quizId })).not.toBeNull();
    expect(await admin.query(api.quizFunctions.getQuizForPlayer, { quizId })).not.toBeNull();
    expect(
      (await admin.query(api.quizFunctions.getAdminQuizzes, {})).find((q) => q._id === quizId)?.isBanned
    ).toBe(true);
    expect(
      await owner.query(api.quizFunctions.getQuizByUsernameSlug, { username: creatorIdentity.nickname, slug: quizFixture.slug })
    ).not.toBeNull();

    await admin.mutation(api.quizFunctions.adminToggleQuizBan, { quizId, ban: false });
    expect(await t.query(api.quizFunctions.getQuizForPlayer, { quizId })).not.toBeNull();
    await expect(
      t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Student" })
    ).resolves.toBeTruthy();
  });

  it("only administrators can ban or unban", async () => {
    const { owner, quizId } = await setup();
    await expect(owner.mutation(api.quizFunctions.adminToggleQuizBan, { quizId, ban: true })).rejects.toThrow();
    await expect(
      owner.mutation(api.quizFunctions.adminToggleUserBan, { clerkId: creatorIdentity.subject, ban: true })
    ).rejects.toThrow();
  });
});
