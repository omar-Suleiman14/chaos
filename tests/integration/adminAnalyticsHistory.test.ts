import { expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { emptyMetrics } from "../../convex/adminModel";
import { createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

it("restricts snapshot history to active admins and never exposes account-level data", async () => {
  const t = await createTestConvexWithAdmin(creatorIdentity.subject);
  await t.run(async ctx => {
    await ctx.db.insert("adminMetricSnapshots", {
      completedAt: 100,
      counts: { ...emptyMetrics, users: 7, responses: 12 },
    });
  });
  const admin = t.withIdentity(creatorIdentity);
  const history = await admin.query(api.adminAnalytics.history, {});
  expect(history).toEqual([{ completedAt: 100, counts: { ...emptyMetrics, users: 7, responses: 12 } }]);
  expect(JSON.stringify(history)).not.toMatch(/studentId|ownerId|email|answer|rubric|grade/i);

  await expect(t.query(api.adminAnalytics.history, {})).rejects.toThrow(/not authenticated|forbidden|admin access required/i);
  await expect(t.withIdentity(otherCreatorIdentity).query(api.adminAnalytics.history, {}))
    .rejects.toThrow(/forbidden|admin access required/i);
  await t.run(async ctx => {
    const grant = await ctx.db.query("admins").withIndex("by_clerkId",
      q => q.eq("clerkId", creatorIdentity.subject)).unique();
    await ctx.db.delete(grant!._id);
  });
  await expect(admin.query(api.adminAnalytics.history, {}))
    .rejects.toThrow(/forbidden|admin access required/i);
});

it("creates one snapshot only when a scan finishes, retaining the newest 30", async () => {
  const t = await createTestConvexWithAdmin(creatorIdentity.subject);
  const startedAt = 42;
  await t.run(async ctx => {
    for (let completedAt = 1; completedAt <= 30; completedAt++) {
      await ctx.db.insert("adminMetricSnapshots", {
        completedAt,
        counts: { ...emptyMetrics, users: completedAt },
      });
    }
    await ctx.db.insert("adminMetrics", {
      key: "platform",
      counts: { ...emptyMetrics, users: 3 },
      pending: { ...emptyMetrics, users: 21 },
      running: true,
      startedAt,
      phase: "forms",
      cursor: null,
    });
  });
  await t.mutation(internal.adminAnalytics.scan, { startedAt });
  const admin = t.withIdentity(creatorIdentity);
  const history = await admin.query(api.adminAnalytics.history, {});
  expect(history).toHaveLength(30);
  expect(history[0].counts.users).toBe(21);
  expect(history[0].completedAt).toBeGreaterThan(30);
  expect(history.at(-1)?.completedAt).toBe(2);
  const overview = await admin.query(api.adminAnalytics.overview, {});
  expect(overview).toMatchObject({
    running: false,
    counts: { users: 21 },
    completedAt: history[0].completedAt,
  });

  await t.mutation(internal.adminAnalytics.scan, { startedAt });
  expect(await admin.query(api.adminAnalytics.history, {})).toEqual(history);
});

it("returns a bounded newest-first history instead of scanning all analytics rows", async () => {
  const t = await createTestConvexWithAdmin(creatorIdentity.subject);
  await t.run(async ctx => {
    for (let i = 0; i < 38; i++) {
      await ctx.db.insert("adminMetricSnapshots", {
        completedAt: 1_000 + i, counts: { ...emptyMetrics, forms: i },
      });
    }
  });
  const history = await t.withIdentity(creatorIdentity).query(api.adminAnalytics.history, {});
  expect(history).toHaveLength(30);
  expect(history[0].completedAt).toBe(1_037);
  expect(history[29].completedAt).toBe(1_008);
});
