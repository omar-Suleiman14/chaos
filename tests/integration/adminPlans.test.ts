import { describe, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { createTestConvexWithAdmin } from "./setup";
import {
  creatorIdentity,
  otherCreatorIdentity,
  quizFixture,
} from "../fixtures";
import { emptyDefinition } from "@/convex/formLogic";

const DAY = 86_400_000;
const adminIdentity = {
  ...otherCreatorIdentity,
  email: "admin@example.com",
  emailVerified: true,
};
async function setup() {
  const t = await createTestConvexWithAdmin(adminIdentity.subject);
  const owner = t.withIdentity(creatorIdentity),
    admin = t.withIdentity(adminIdentity);
  const userId = await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  return { t, owner, admin, userId };
}
function definition() {
  const def = emptyDefinition("Test form");
  def.fields = [{ id: "q", type: "text", label: "Question", required: false }];
  return def;
}

describe("admin plans and moderation", () => {
  it("grants admin from the admins table, never from an email", async () => {
    const { t, owner, userId } = await setup();
    await t.run((ctx) => ctx.db.patch(userId, { email: adminIdentity.email }));
    expect(await owner.query(api.quizFunctions.getIsAdmin, {})).toBe(false);
    expect(
      await t
        .withIdentity({ ...creatorIdentity, email: adminIdentity.email, emailVerified: true })
        .query(api.quizFunctions.getIsAdmin, {}),
    ).toBe(false);
    expect(
      await t
        .withIdentity(adminIdentity)
        .query(api.quizFunctions.getIsAdmin, {}),
    ).toBe(true);
    await expect(
      owner.mutation(api.admin.bulkPlan, {
        userIds: [userId],
        plan: "pro",
        reason: "test",
      }),
    ).rejects.toThrow("Forbidden");
    await expect(t.query(api.adminAnalytics.overview, {})).rejects.toThrow(
      "Not authenticated",
    );
    await expect(
      owner.query(api.admin.users, {
        paginationOpts: { cursor: null, numItems: 25 },
      }),
    ).rejects.toThrow("Forbidden");
    await expect(
      owner.mutation(api.admin.allUsersPlan, { plan: "free", reason: "test" }),
    ).rejects.toThrow("Forbidden");
  });
  it("expires new-user trials without refreshing them on sign-in", async () => {
    const { t, owner, userId } = await setup();
    const original = await t.run((ctx) => ctx.db.get(userId));
    vi.setSystemTime(Date.now() + DAY);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    expect((await t.run((ctx) => ctx.db.get(userId)))?.planExpiresAt).toBe(
      original!.planExpiresAt,
    );
    vi.setSystemTime(Date.now() + 31 * DAY);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await t.run((ctx) => ctx.db.get(userId)))?.plan).toBe("free");
  });
  it("old expiry jobs cannot revoke a renewed grant", async () => {
    const { t, admin, userId } = await setup();
    const first = (await t.run((ctx) => ctx.db.get(userId)))!.planExpiresAt!;
    vi.setSystemTime(Date.now() + DAY);
    await admin.mutation(api.admin.setPlan, {
      userId,
      plan: "pro",
      reason: "Renewal",
    });
    vi.setSystemTime(first);
    await t.mutation(internal.admin.expirePlan, { userId, expiresAt: first });
    expect((await t.run((ctx) => ctx.db.get(userId)))?.plan).toBe("pro");
    vi.setSystemTime(Date.now() + 31 * DAY);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await t.run((ctx) => ctx.db.get(userId)))?.plan).toBe("free");
  });
  it("shares Free's five-item quota across forms and quizzes, does not refund deletion, and resets next month", async () => {
    const { t, admin, owner, userId } = await setup();
    await admin.mutation(api.admin.setPlan, {
      userId,
      plan: "free",
      reason: "Test Free",
    });
    const ids: import("@/convex/_generated/dataModel").Id<"forms">[] = [];
    for (let i = 0; i < 3; i++)
      ids.push(
        await owner.mutation(api.forms.createForm, {
          definition: definition(),
        }),
      );
    for (let i = 0; i < 2; i++)
      await owner.mutation(api.quizFunctions.createQuiz, {
        title: `Quiz ${i}`,
      });
    await expect(
      owner.mutation(api.forms.createForm, { definition: definition() }),
    ).rejects.toThrow("MONTHLY_CREATION_LIMIT");
    await t.run((ctx) => ctx.db.delete(ids[0]));
    await expect(
      owner.mutation(api.forms.createForm, { definition: definition() }),
    ).rejects.toThrow("MONTHLY_CREATION_LIMIT");
    const now = new Date();
    vi.setSystemTime(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    await expect(
      owner.mutation(api.forms.createForm, { definition: definition() }),
    ).resolves.toBeTruthy();
  });
  it("enforces expiry before the scheduled job runs and blocks copies", async () => {
    const { t, owner, userId } = await setup();
    const formId = await owner.mutation(api.forms.createForm, {
      definition: definition(),
    });
    for (let i = 0; i < 5; i++)
      await owner.mutation(api.forms.duplicateForm, { formId });
    await t.run((ctx) =>
      ctx.db.patch(userId, { planExpiresAt: Date.now() - 1 }),
    );
    await expect(
      owner.mutation(api.forms.duplicateForm, { formId }),
    ).rejects.toThrow("MONTHLY_CREATION_LIMIT");
  });
  it("suspends writes and collection, then restores automatically; bans do not expire", async () => {
    const { t, admin, owner, userId } = await setup();
    const formId = await owner.mutation(api.forms.createForm, {
      definition: definition(),
    });
    await owner.mutation(api.forms.publishForm, {
      formId,
      expectedRevision: 1,
    });
    const form = (await t.run((ctx) => ctx.db.get(formId)))!;
    await admin.mutation(api.admin.moderateUser, {
      userId,
      state: "suspended",
      days: 1,
      reason: "Review",
    });
    await expect(
      owner.mutation(api.forms.createForm, { definition: definition() }),
    ).rejects.toThrow("ACCOUNT_SUSPENDED");
    expect(
      (await t.query(api.respond.getPublicForm, { shareId: form.shareId }))
        .state,
    ).toBe("unavailable");
    const until = (await t.run((ctx) => ctx.db.get(userId)))!.suspendedUntil!;
    vi.setSystemTime(until);
    await t.mutation(internal.admin.expireSuspension, {
      userId,
      expiresAt: until,
    });
    expect(
      (await t.query(api.respond.getPublicForm, { shareId: form.shareId }))
        .state,
    ).toBe("open");
    await admin.mutation(api.admin.moderateUser, {
      userId,
      state: "banned",
      reason: "Ban",
    });
    await t.mutation(internal.admin.expireSuspension, {
      userId,
      expiresAt: until,
    });
    expect((await t.run((ctx) => ctx.db.get(userId)))?.isBanned).toBe(true);
  });
  it("holds forms and quizzes without deleting data or permitting republish", async () => {
    const { t, admin, owner } = await setup();
    const formId = await owner.mutation(api.forms.createForm, {
      definition: definition(),
    });
    await owner.mutation(api.forms.publishForm, {
      formId,
      expectedRevision: 1,
    });
    await admin.mutation(api.admin.moderateContent, {
      targetId: formId,
      hold: true,
      reason: "Review",
    });
    await expect(
      owner.mutation(api.forms.setFormStatus, { formId, status: "live" }),
    ).rejects.toThrow("CONTENT_HELD");
    await expect(
      owner.mutation(api.forms.publishForm, { formId, expectedRevision: 1 }),
    ).rejects.toThrow("CONTENT_HELD");
    await admin.mutation(api.admin.moderateContent, {
      targetId: formId,
      hold: false,
      reason: "Reviewed",
    });
    expect((await t.run((ctx) => ctx.db.get(formId)))?.status).toBe("closed");
    const quizId = await t.run((ctx) =>
      ctx.db.insert("quizzes", {
        ...quizFixture,
        creatorId: creatorIdentity.subject,
        creatorUsername: "creator",
      }),
    );
    const sessionId = await t.mutation(api.quizFunctions.startQuizSession, {
      quizId,
      playerName: "Student",
    });
    await admin.mutation(api.admin.moderateContent, {
      targetId: quizId,
      hold: true,
      reason: "Review",
    });
    await expect(
      owner.mutation(api.quizFunctions.publishQuiz, { quizId }),
    ).rejects.toThrow("CONTENT_HELD");
    await expect(
      t.mutation(api.quizFunctions.completeQuizSession, { sessionId }),
    ).rejects.toThrow("QUIZ_UNAVAILABLE");
    expect(await t.run((ctx) => ctx.db.get(sessionId))).not.toBeNull();
  });
  it("bulk updates selected accounts and all accounts across pages", async () => {
    const { t, admin, userId } = await setup();
    await admin.mutation(api.admin.bulkPlan, {
      userIds: [userId, userId],
      plan: "free",
      reason: "Selected",
    });
    expect((await t.run((ctx) => ctx.db.get(userId)))?.plan).toBe("free");
    await t.run(async (ctx) => {
      for (let i = 0; i < 55; i++)
        await ctx.db.insert("users", {
          clerkId: `bulk_${i}`,
          email: `bulk${i}@example.com`,
          name: `Bulk ${i}`,
          username: `bulk${i}`,
          createdAt: Date.now(),
          plan: "free",
        });
    });
    vi.setSystemTime(Date.now() + 1000);
    const jobId = await admin.mutation(api.admin.allUsersPlan, {
      plan: "free",
      reason: "All",
    });
    // Only drain immediate batches; the trial expiry is intentionally left in the future.
    await vi.advanceTimersByTimeAsync(0);
    await t.finishInProgressScheduledFunctions();
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
    expect(await admin.query(api.admin.bulkJob, { jobId })).toEqual({
      done: true,
      processed: 56,
    });
    expect((await admin.query(api.admin.activity, {})).length).toBe(50);
  });
});

it("computes platform-wide analytics over multiple pages and excludes restricted owners from live counts", async () => {
  const { t, admin, owner, userId } = await setup();
  await t.run(async (ctx) => {
    for (let i = 0; i < 31; i++)
      await ctx.db.insert("quizzes", {
        ...quizFixture,
        creatorId: creatorIdentity.subject,
        creatorUsername: "creator",
      });
  });
  await admin.mutation(api.admin.moderateUser, {
    userId,
    state: "banned",
    reason: "Test restriction",
  });
  await admin.mutation(api.adminAnalytics.refresh, {});
  for (let i = 0; i < 10; i++) {
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
  }
  const report = await admin.query(api.adminAnalytics.overview, {});
  expect(report?.running).toBe(false);
  expect(report?.counts).toMatchObject({
    users: 1,
    quizzes: 31,
    liveQuizzes: 0,
    restricted: 1,
  });
  await expect(owner.mutation(api.adminAnalytics.refresh, {})).rejects.toThrow(
    "Forbidden",
  );
});
