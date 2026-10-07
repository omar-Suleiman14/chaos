import { expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, quizFixture } from "../fixtures";

it("pages legacy admin lists and reads totals from completed analytics", async () => {
  const t = await createTestConvexWithAdmin(creatorIdentity.subject);
  const admin = t.withIdentity(creatorIdentity);
  expect(await admin.query(api.quizFunctions.getAdminStats, {})).toMatchObject({ totalUsers: null, totalQuizzes: null, completedAt: null });
  await t.run(async ctx => {
    for (let i = 0; i < 32; i++) {
      await ctx.db.insert("users", { clerkId: `user-${i}`, name: `User ${i}`, email: `user${i}@example.com`, username: `user${i}`, createdAt: Date.now() });
      await ctx.db.insert("quizzes", { ...quizFixture, title: `Quiz ${i}`, isPublished: true, updatedAt: Date.now(), creatorId: creatorIdentity.subject, creatorUsername: creatorIdentity.nickname });
    }
  });
  const first = await admin.query(api.quizFunctions.getAdminQuizzes, { paginationOpts: { numItems: 2, cursor: null } });
  const second = await admin.query(api.quizFunctions.getAdminQuizzes, { paginationOpts: { numItems: 2, cursor: first.continueCursor } });
  expect(first.page).toHaveLength(2);
  expect(first.isDone).toBe(false);
  expect(second.page.map(q => q.id)).not.toEqual(first.page.map(q => q.id));
  expect(JSON.stringify(first)).not.toContain("publishedSnapshot");
  expect((await admin.query(api.quizFunctions.getAdminUsers, { paginationOpts: { numItems: 2, cursor: null } })).page).toHaveLength(2);
  await expect(admin.query(api.quizFunctions.getAdminUsers, { paginationOpts: { numItems: 500, cursor: null } })).rejects.toThrow("Page size");
  await admin.mutation(api.adminAnalytics.refresh, {});
  for (let i = 0; i < 12; i++) {
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
  }
  expect(await admin.query(api.quizFunctions.getAdminStats, {})).toMatchObject({ totalUsers: 32, totalQuizzes: 32, totalSubmissions: 0, activeToday: 32, refreshing: false });
  vi.setSystemTime(Date.now() + 86_400_000);
  expect(await admin.query(api.quizFunctions.getAdminStats, {})).toMatchObject({ totalUsers: 32, activeToday: null });
});
