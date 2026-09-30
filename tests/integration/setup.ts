/// <reference types="vite/client" />
import { beforeEach, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";

// import.meta.glob must be called directly in a file the Vite/Vitest
// transform sees; re-export the resolved map so every integration test can
// share one convexTest() factory instead of repeating this glob.
const modules = import.meta.glob("../../convex/**/*.*s");

export function createTestConvex() {
  return convexTest(schema, modules);
}

// Convex schedules can exceed the native Node 24.8-day timer range.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

/** A test deployment where `clerkId` is an admin (admins live in the `admins` table). */
export async function createTestConvexWithAdmin(clerkId: string, email = "admin@example.com") {
  const t = createTestConvex();
  await t.run(async (ctx) => {
    await ctx.db.insert("admins", { clerkId, email, grantedAt: 0 });
  });
  return t;
}
