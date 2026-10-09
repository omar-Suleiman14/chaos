import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex, createTestConvexWithAdmin } from "./setup";
import { creatorIdentity } from "../fixtures";

const adminIdentity = {
  ...creatorIdentity,
  subject: "user_admin",
  tokenIdentifier: "https://chaos.test.clerk.accounts.dev|user_admin",
  email: "admin@example.com",
  nickname: "admin",
};

async function seedAdminTargets(t: ReturnType<typeof createTestConvex>) {
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  return await owner.mutation(api.forms.createForm, { quizMode: true });
}

const paginationOpts = { numItems: 25, cursor: null };

describe("admin authorization", () => {
  it("exposes only a derived isAdmin boolean from the configured Clerk user ID", async () => {
    const t = await createTestConvexWithAdmin(adminIdentity.subject);

    await expect(t.query(api.quizFunctions.getIsAdmin, {})).resolves.toBe(false);
    await expect(
      t.withIdentity(creatorIdentity).query(api.quizFunctions.getIsAdmin, {})
    ).resolves.toBe(false);
    await expect(
      t.withIdentity(adminIdentity).query(api.quizFunctions.getIsAdmin, {})
    ).resolves.toBe(true);
  });

  it("rejects non-admin and anonymous callers for every admin operation", async () => {
    const t = await createTestConvexWithAdmin(adminIdentity.subject);
    const formId = await seedAdminTargets(t);
    const user = t.withIdentity(creatorIdentity);

    const nonAdminCalls = [
      user.query(api.quizFunctions.getAdminStats, {}),
      user.query(api.quizFunctions.getAdminUsers, {}),
      user.query(api.admin.content, { kind: "forms", paginationOpts }),
      user.mutation(api.quizFunctions.adminToggleUserBan, {
        clerkId: creatorIdentity.subject,
        ban: true,
      }),
      user.mutation(api.quizFunctions.adminToggleUserElevation, {
        clerkId: creatorIdentity.subject,
        elevate: true,
      }),
      user.mutation(api.admin.moderateContent, { targetId: formId, hold: true, reason: "Review" }),
      user.mutation(api.quizFunctions.updateGlobalConfig, { playerLimitErrorText: "blocked" }),
    ];

    for (const call of nonAdminCalls) {
      await expect(call).rejects.toThrow(/forbidden|admin access required/i);
    }

    const anonymousCalls = [
      t.query(api.quizFunctions.getAdminStats, {}),
      t.query(api.quizFunctions.getAdminUsers, {}),
      t.query(api.admin.content, { kind: "forms", paginationOpts }),
      t.mutation(api.quizFunctions.adminToggleUserBan, {
        clerkId: creatorIdentity.subject,
        ban: true,
      }),
      t.mutation(api.quizFunctions.adminToggleUserElevation, {
        clerkId: creatorIdentity.subject,
        elevate: true,
      }),
      t.mutation(api.admin.moderateContent, { targetId: formId, hold: true, reason: "Review" }),
      t.mutation(api.quizFunctions.updateGlobalConfig, { playerLimitErrorText: "blocked" }),
    ];

    for (const call of anonymousCalls) {
      await expect(call).rejects.toThrow(/not authenticated/i);
    }
  });

  it("allows the configured admin to use every admin operation", async () => {
    const t = await createTestConvexWithAdmin(adminIdentity.subject);
    const formId = await seedAdminTargets(t);
    const admin = t.withIdentity(adminIdentity);

    await admin.query(api.quizFunctions.getAdminStats, {});
    await admin.query(api.quizFunctions.getAdminUsers, {});
    await admin.query(api.admin.content, { kind: "forms", paginationOpts });
    await admin.mutation(api.quizFunctions.adminToggleUserBan, {
      clerkId: creatorIdentity.subject,
      ban: true,
    });
    await admin.mutation(api.quizFunctions.adminToggleUserElevation, {
      clerkId: creatorIdentity.subject,
      elevate: true,
    });
    await admin.mutation(api.admin.moderateContent, { targetId: formId, hold: true, reason: "Review" });
    await admin.mutation(api.quizFunctions.updateGlobalConfig, { playerLimitErrorText: "configured" });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject))
        .first(),
      form: await ctx.db.get(formId),
      config: await ctx.db.query("globalConfig").first(),
    }));
    expect(state.user?.isBanned).toBe(true);
    expect(state.user?.isElevated).toBe(true);
    expect(state.form?.isBanned).toBe(true);
    expect(state.config?.playerLimitErrorText).toBe("configured");
  });
});
