import { expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, otherCreatorIdentity, quizFixture, questionFixtures } from "../fixtures";

async function setup() {
  const t = await createTestConvexWithAdmin(otherCreatorIdentity.subject);
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const ids = await t.run(async ctx => {
    const quizId = await ctx.db.insert("quizzes", { ...quizFixture, creatorId: creatorIdentity.subject, creatorUsername: creatorIdentity.nickname });
    const questionId = await ctx.db.insert("questions", { ...questionFixtures.mcq, quizId });
    return { quizId, questionId };
  });
  return { t, owner, ...ids };
}

it("archives a classic quiz without losing published snapshots, questions, answers or attempt history", async () => {
  const { t, owner, quizId, questionId } = await setup();
  const sessionId = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Completed" });
  await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId, answer: "4" });
  await t.mutation(api.quizFunctions.completeQuizSession, { sessionId });
  const running = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Running" });
  const before = await t.run(async ctx => ({ session: await ctx.db.get(sessionId), running: await ctx.db.get(running), question: await ctx.db.get(questionId) }));
  await owner.mutation(api.quizFunctions.setQuizArchived, { quizId, archived: true });
  const row = await t.run(ctx => ctx.db.get(quizId));
  expect(row).toMatchObject({ archived: true, isPublished: false, publishedSnapshot: { title: quizFixture.title, questions: [expect.objectContaining({ _id: questionId })] } });
  expect(await t.run(async ctx => ({ session: await ctx.db.get(sessionId), running: await ctx.db.get(running), question: await ctx.db.get(questionId) }))).toEqual(before);
  expect(await owner.query(api.quizFunctions.getMyQuizzes, {})).toEqual([expect.objectContaining({ _id: quizId, archived: true, questionCount: 1, sessionCount: 1 })]);
  expect(await t.query(api.quizFunctions.getQuizForPlayer, { quizId })).toBeNull();
  expect(await t.query(api.quizFunctions.getQuizByUsernameSlug, { username: creatorIdentity.nickname, slug: quizFixture.slug })).toBeNull();
  await expect(t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Late" })).rejects.toThrow("QUIZ_UNAVAILABLE");
  await expect(t.mutation(api.quizFunctions.gradeAnswer, { sessionId: running, questionId, answer: "4" })).rejects.toThrow("QUIZ_UNAVAILABLE");
  await expect(t.mutation(api.quizFunctions.completeQuizSession, { sessionId: running })).rejects.toThrow("QUIZ_UNAVAILABLE");
  const admin = t.withIdentity(otherCreatorIdentity);
  expect((await admin.query(api.admin.content, { kind: "quizzes", paginationOpts: { cursor: null, numItems: 25 } })).page[0].status).toBe("archived");
  expect(await owner.query(api.quizFunctions.getQuizForOwner, { quizId })).not.toBeNull();
});

it("blocks publication until restoration and restores as a draft without republishing", async () => {
  const { t, owner, quizId } = await setup();
  await owner.mutation(api.quizFunctions.setQuizArchived, { quizId, archived: true });
  await expect(owner.mutation(api.quizFunctions.publishQuiz, { quizId })).rejects.toThrow("QUIZ_ARCHIVED");
  await expect(owner.mutation(api.quizFunctions.updateQuiz, { quizId, isPublished: true })).rejects.toThrow("QUIZ_ARCHIVED");
  const snapshot = (await t.run(ctx => ctx.db.get(quizId)))!.publishedSnapshot;
  const archived = await owner.mutation(api.quizFunctions.setQuizArchived, { quizId, archived: true });
  expect((await t.run(ctx => ctx.db.get(quizId)))!.updatedAt).toBe(archived.updatedAt);
  await owner.mutation(api.quizFunctions.setQuizArchived, { quizId, archived: false });
  expect(await t.run(ctx => ctx.db.get(quizId))).toMatchObject({ archived: false, isPublished: false, publishedSnapshot: snapshot });
  expect(await t.query(api.quizFunctions.getQuizForPlayer, { quizId })).toBeNull();
  await owner.mutation(api.quizFunctions.publishQuiz, { quizId });
  expect(await t.query(api.quizFunctions.getQuizForPlayer, { quizId })).not.toBeNull();
});

it("limits archiving and restoring to the active quiz owner", async () => {
  const { t, owner, quizId } = await setup();
  const other = t.withIdentity(otherCreatorIdentity);
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  for (const archived of [true, false]) {
    await expect(t.mutation(api.quizFunctions.setQuizArchived, { quizId, archived })).rejects.toThrow(/Not authenticated/);
    await expect(other.mutation(api.quizFunctions.setQuizArchived, { quizId, archived })).rejects.toThrow(/unauthorized/);
  }
  await t.run(async ctx => { const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", creatorIdentity.subject)).first(); await ctx.db.patch(user!._id, { isBanned: true }); });
  await expect(owner.mutation(api.quizFunctions.setQuizArchived, { quizId, archived: true })).rejects.toThrow("ACCOUNT_BANNED");
  expect((await t.run(ctx => ctx.db.get(quizId)))!.archived).toBeUndefined();
});
