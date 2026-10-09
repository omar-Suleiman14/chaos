import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvexWithAdmin } from "./setup";
import { creatorIdentity } from "../fixtures";

const adminIdentity = {
  ...creatorIdentity,
  subject: "user_privilege_admin",
  tokenIdentifier: "https://chaos.test.clerk.accounts.dev|user_privilege_admin",
  email: "privilege-admin@example.com",
  nickname: "privilege-admin",
};

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

    const adminUser = await t.run(async (ctx) => ctx.db.get(adminUserId));
    expect(adminUser?.isElevated).toBe(true);
    expect(adminUser?.plan).toBe("pro");

    await admin.mutation(api.quizFunctions.adminToggleUserElevation, {
      clerkId: creatorIdentity.subject,
      elevate: true,
    });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(creatorUserId),
    }));
    expect(state.user?.isElevated).toBe(true);
    expect(state.user?.isBanned).toBe(true);
  });
});
