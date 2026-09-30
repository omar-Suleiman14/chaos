import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex, createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, quizFixture } from "../fixtures";

const adminIdentity = {
  ...creatorIdentity,
  subject: "user_privilege_admin",
  tokenIdentifier: "https://chaos.test.clerk.accounts.dev|user_privilege_admin",
  email: "privilege-admin@example.com",
  nickname: "privilege-admin",
};

async function seedQuizWithCompletedSessions(
  t: ReturnType<typeof createTestConvex>,
  options: { creatorId: string; isElevated: boolean; count?: number }
) {
  return await t.run(async (ctx) => {
    const historicalSessionTime = Date.now() - 120_000;
    const quizId = await ctx.db.insert("quizzes", {
      ...quizFixture,
      creatorId: options.creatorId,
      creatorUsername: "creator",
      isElevated: options.isElevated,
    });

    for (let i = 0; i < (options.count ?? 100); i += 1) {
      await ctx.db.insert("quizSessions", {
        quizId,
        playerName: `Player ${i + 1}`,
        status: "completed",
        score: 0,
        totalPoints: 0,
        answers: [],
        startedAt: historicalSessionTime,
        completedAt: historicalSessionTime,
      });
    }

    return quizId;
  });
}

describe("user privilege defaults", () => {
  it("creates a new user with a 30-day Pro trial", async () => {
    const t = await createTestConvexWithAdmin(adminIdentity.subject);
    const userId = await t
      .withIdentity(creatorIdentity)
      .mutation(api.quizFunctions.getOrCreateUser, {});

    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user?.isElevated).toBe(true);
    expect(user?.plan).toBe("pro");
    expect(user?.planExpiresAt).toBe(Date.now() + 30 * 86_400_000);
    expect(user?.isBanned).toBe(false);
  });

  it("does not silently change existing elevated or banned accounts during profile sync", async () => {
    const t = await createTestConvexWithAdmin(adminIdentity.subject);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkId: creatorIdentity.subject,
        name: creatorIdentity.name,
        email: creatorIdentity.email,
        username: creatorIdentity.nickname,
        isElevated: true,
        isBanned: true,
        createdAt: Date.now(),
      })
    );

    await t.withIdentity(creatorIdentity).mutation(api.quizFunctions.getOrCreateUser, {});

    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user?.isElevated).toBe(true);
    expect(user?.isBanned).toBe(true);
  });

  it("enforces the 100-completed-respondent cap for a non-elevated quiz", async () => {
    const t = await createTestConvexWithAdmin(adminIdentity.subject);
    const quizId = await seedQuizWithCompletedSessions(t, {
      creatorId: creatorIdentity.subject,
      isElevated: false,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("globalConfig", {
        playerLimitErrorText: "Configured respondent quota message",
      });
    });

    await expect(
      t.mutation(api.quizFunctions.startQuizSession, {
        quizId,
        playerName: "Blocked Player",
      })
    ).rejects.toThrow("Configured respondent quota message");
  });

  it("lets an elevated creator bypass the respondent limit", async () => {
    const t = await createTestConvexWithAdmin(adminIdentity.subject);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: creatorIdentity.subject,
        name: creatorIdentity.name,
        email: creatorIdentity.email,
        username: creatorIdentity.nickname,
        isElevated: true,
        createdAt: Date.now(),
      });
    });
    const quizId = await seedQuizWithCompletedSessions(t, {
      creatorId: creatorIdentity.subject,
      isElevated: true,
    });

    await expect(
      t.mutation(api.quizFunctions.startQuizSession, {
        quizId,
        playerName: "Allowed Player",
      })
    ).resolves.toBeTruthy();
  });

  it("gives administrators the same trial and supports explicit grants", async () => {
    const t = await createTestConvexWithAdmin(adminIdentity.subject);
    const admin = t.withIdentity(adminIdentity);
    const adminUserId = await admin.mutation(api.quizFunctions.getOrCreateUser, {});
    const creatorUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkId: creatorIdentity.subject,
        name: creatorIdentity.name,
        email: creatorIdentity.email,
        username: creatorIdentity.nickname,
        isElevated: false,
        isBanned: true,
        createdAt: Date.now(),
      })
    );
    const quizId = await t.run(async (ctx) =>
      ctx.db.insert("quizzes", {
        ...quizFixture,
        creatorId: creatorIdentity.subject,
        creatorUsername: creatorIdentity.nickname,
        isElevated: false,
      })
    );

    const adminUser = await t.run(async (ctx) => ctx.db.get(adminUserId));
    expect(adminUser?.isElevated).toBe(true);
    expect(adminUser?.plan).toBe("pro");

    await admin.mutation(api.quizFunctions.adminToggleUserElevation, {
      clerkId: creatorIdentity.subject,
      elevate: true,
    });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(creatorUserId),
      quiz: await ctx.db.get(quizId),
    }));
    expect(state.user?.isElevated).toBe(true);
    expect(state.user?.isBanned).toBe(true);
    expect(state.quiz?.isElevated).toBe(true);
  });
});
