import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity, questionFixtures, quizFixture } from "../fixtures";

async function seedQuizWithQuestion(t: ReturnType<typeof createTestConvex>) {
  return await t.run(async (ctx) => {
    const quizId = await ctx.db.insert("quizzes", {
      ...quizFixture,
      creatorId: creatorIdentity.subject,
      creatorUsername: creatorIdentity.nickname,
    });
    const questionId = await ctx.db.insert("questions", {
      ...questionFixtures.mcq,
      quizId,
    });
    return { quizId, questionId };
  });
}

describe("deleteQuestion authorization", () => {
  it("rejects an unauthenticated caller", async () => {
    const t = createTestConvex();
    const { questionId } = await seedQuizWithQuestion(t);

    await expect(
      t.mutation(api.quizFunctions.deleteQuestion, { questionId })
    ).rejects.toThrow(/not authenticated/i);

    const question = await t.run(async (ctx) => ctx.db.get(questionId));
    expect(question).not.toBeNull();
  });

  it("rejects a caller who does not own the quiz", async () => {
    const t = createTestConvex();
    const { questionId } = await seedQuizWithQuestion(t);

    await expect(
      t.withIdentity(otherCreatorIdentity).mutation(api.quizFunctions.deleteQuestion, { questionId })
    ).rejects.toThrow(/unauthorized/i);

    const question = await t.run(async (ctx) => ctx.db.get(questionId));
    expect(question).not.toBeNull();
  });

  it("allows the owning creator to delete their own question", async () => {
    const t = createTestConvex();
    const { questionId } = await seedQuizWithQuestion(t);

    await t.withIdentity(creatorIdentity).mutation(api.quizFunctions.deleteQuestion, { questionId });

    const question = await t.run(async (ctx) => ctx.db.get(questionId));
    expect(question).toBeNull();
  });
});
