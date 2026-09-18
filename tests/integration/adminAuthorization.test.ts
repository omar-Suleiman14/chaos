import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, quizFixture } from "../fixtures";

const adminIdentity = {
  ...creatorIdentity,
  subject: "user_admin",
  tokenIdentifier: "https://chaos.test.clerk.accounts.dev|user_admin",
  email: "admin@example.com",
  nickname: "admin",
};

const originalAdminUserIds = process.env.CHAOS_ADMIN_USER_IDS;

beforeAll(() => {
  process.env.CHAOS_ADMIN_USER_IDS = adminIdentity.subject;
});

afterAll(() => {
  if (originalAdminUserIds === undefined) {
    delete process.env.CHAOS_ADMIN_USER_IDS;
  } else {
    process.env.CHAOS_ADMIN_USER_IDS = originalAdminUserIds;
  }
});

async function seedAdminTargets(t: ReturnType<typeof createTestConvex>) {
  return await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkId: creatorIdentity.subject,
      name: creatorIdentity.name,
      email: creatorIdentity.email,
      username: creatorIdentity.nickname,
      createdAt: quizFixture.createdAt,
    });

    return await ctx.db.insert("quizzes", {
      ...quizFixture,
      creatorId: creatorIdentity.subject,
      creatorUsername: creatorIdentity.nickname,
    });
  });
}

describe("admin authorization", () => {
  it("exposes only a derived isAdmin boolean from the configured Clerk user ID", async () => {
    const t = createTestConvex();

    await expect(t.query(api.quizFunctions.getIsAdmin, {})).resolves.toBe(false);
    await expect(
      t.withIdentity(creatorIdentity).query(api.quizFunctions.getIsAdmin, {})
    ).resolves.toBe(false);
    await expect(
      t.withIdentity(adminIdentity).query(api.quizFunctions.getIsAdmin, {})
    ).resolves.toBe(true);
  });

  it("rejects non-admin and anonymous callers for every admin operation", async () => {
    const t = createTestConvex();
    const quizId = await seedAdminTargets(t);
    const user = t.withIdentity(creatorIdentity);

    const nonAdminCalls = [
      user.query(api.quizFunctions.getAdminStats, {}),
      user.query(api.quizFunctions.getAdminUsers, {}),
      user.query(api.quizFunctions.getAdminQuizzes, {}),
      user.mutation(api.quizFunctions.adminToggleUserBan, {
        clerkId: creatorIdentity.subject,
        ban: true,
      }),
      user.mutation(api.quizFunctions.adminToggleUserElevation, {
        clerkId: creatorIdentity.subject,
        elevate: true,
      }),
      user.mutation(api.quizFunctions.adminToggleQuizElevation, { quizId, elevate: true }),
      user.mutation(api.quizFunctions.adminToggleQuizBan, { quizId, ban: true }),
      user.mutation(api.quizFunctions.updateGlobalConfig, { aiLimitPopupText: "blocked" }),
      user.mutation(api.quizFunctions.adminDeleteQuiz, { quizId }),
    ];

    for (const call of nonAdminCalls) {
      await expect(call).rejects.toThrow(/forbidden|admin access required/i);
    }

    const anonymousCalls = [
      t.query(api.quizFunctions.getAdminStats, {}),
      t.query(api.quizFunctions.getAdminUsers, {}),
      t.query(api.quizFunctions.getAdminQuizzes, {}),
      t.mutation(api.quizFunctions.adminToggleUserBan, {
        clerkId: creatorIdentity.subject,
        ban: true,
      }),
      t.mutation(api.quizFunctions.adminToggleUserElevation, {
        clerkId: creatorIdentity.subject,
        elevate: true,
      }),
      t.mutation(api.quizFunctions.adminToggleQuizElevation, { quizId, elevate: true }),
      t.mutation(api.quizFunctions.adminToggleQuizBan, { quizId, ban: true }),
      t.mutation(api.quizFunctions.updateGlobalConfig, { aiLimitPopupText: "blocked" }),
      t.mutation(api.quizFunctions.adminDeleteQuiz, { quizId }),
    ];

    for (const call of anonymousCalls) {
      await expect(call).rejects.toThrow(/not authenticated/i);
    }
  });

  it("allows the configured admin to use every admin operation", async () => {
    const t = createTestConvex();
    const quizId = await seedAdminTargets(t);
    const admin = t.withIdentity(adminIdentity);

    await admin.query(api.quizFunctions.getAdminStats, {});
    await admin.query(api.quizFunctions.getAdminUsers, {});
    await admin.query(api.quizFunctions.getAdminQuizzes, {});
    await admin.mutation(api.quizFunctions.adminToggleUserBan, {
      clerkId: creatorIdentity.subject,
      ban: true,
    });
    await admin.mutation(api.quizFunctions.adminToggleUserElevation, {
      clerkId: creatorIdentity.subject,
      elevate: true,
    });
    await admin.mutation(api.quizFunctions.adminToggleQuizElevation, { quizId, elevate: true });
    await admin.mutation(api.quizFunctions.adminToggleQuizBan, { quizId, ban: true });
    await admin.mutation(api.quizFunctions.updateGlobalConfig, { aiLimitPopupText: "configured" });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject))
        .first(),
      quiz: await ctx.db.get(quizId),
      config: await ctx.db.query("globalConfig").first(),
    }));
    expect(state.user?.isBanned).toBe(true);
    expect(state.user?.isElevated).toBe(true);
    expect(state.quiz?.isBanned).toBe(true);
    expect(state.quiz?.isElevated).toBe(true);
    expect(state.config?.aiLimitPopupText).toBe("configured");

    await admin.mutation(api.quizFunctions.adminDeleteQuiz, { quizId });
    await expect(t.run(async (ctx) => ctx.db.get(quizId))).resolves.toBeNull();
  });
});
