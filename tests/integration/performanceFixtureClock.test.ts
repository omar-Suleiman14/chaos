import { expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestConvex } from "./setup";
import { seedWorkspace } from "../../perf/lib/fixtures";

const nativeSetTimeout = globalThis.setTimeout;

it("keeps trial expiry pending when shared seeding starts outside per-test fake timers", async () => {
  // Shared beforeAll seeding runs before setup.ts's per-test clock hook.
  vi.useRealTimers();
  const t = createTestConvex();
  const { owner } = await seedWorkspace(t);
  const expiries = () => t.run(async ctx => (await ctx.db.system.query("_scheduled_functions").collect()).filter(job => job.name === "admin:expirePlan"));
  const scheduled = await expiries();
  expect(scheduled).toHaveLength(1);
  expect(scheduled[0].state.kind).toBe("pending");
  expect(scheduled[0].scheduledTime).toBeGreaterThan(Date.now());
  // Real wall-clock time must not fire fixture jobs on the synthetic clock.
  await new Promise<void>(resolve => nativeSetTimeout(resolve, 10));
  expect((await expiries())[0].state.kind).toBe("pending");
  expect((await owner.query(api.quizFunctions.getCurrentUser, {}))?.plan).toBe("pro");
});
