import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ConvexReactClient } from "convex/react";
import { api } from "@/convex/_generated/api";
import { resetQueryCache, retainQuery } from "@/lib/queryCache";

let watches: { args: unknown; stop: ReturnType<typeof vi.fn> }[] = [];
const client = {
  watchQuery: (_query: unknown, args: unknown) => ({ onUpdate: () => { const stop = vi.fn(); watches.push({ args, stop }); return stop; } }),
} as unknown as ConvexReactClient;

beforeEach(() => { vi.useFakeTimers(); watches = []; });
afterEach(() => { resetQueryCache(); vi.useRealTimers(); });

it("keeps a subscription warm for a few minutes after the last user leaves", () => {
  const release = retainQuery(client, api.courses.getPublic, { courseId: "c1" });
  expect(watches).toHaveLength(1);
  release();
  vi.advanceTimersByTime(60_000);
  expect(watches[0].stop).not.toHaveBeenCalled();
  // Coming back within the window reuses the same live subscription.
  const again = retainQuery(client, api.courses.getPublic, { courseId: "c1" });
  expect(watches).toHaveLength(1);
  again();
  vi.advanceTimersByTime(5 * 60_000);
  expect(watches[0].stop).toHaveBeenCalledTimes(1);
});

it("keeps one subscription per query and arguments while anyone uses it", () => {
  const a = retainQuery(client, api.courses.getPublic, { courseId: "c1" });
  const b = retainQuery(client, api.courses.getPublic, { courseId: "c1" });
  retainQuery(client, api.courses.getPublic, { courseId: "c2" });
  expect(watches.map((w) => w.args)).toEqual([{ courseId: "c1" }, { courseId: "c2" }]);
  a();
  vi.advanceTimersByTime(10 * 60_000);
  expect(watches[0].stop).not.toHaveBeenCalled();
  b(); b();
  vi.advanceTimersByTime(5 * 60_000);
  expect(watches[0].stop).toHaveBeenCalledTimes(1);
});

it("drops the oldest idle subscriptions when too many are kept", () => {
  for (let i = 0; i < 45; i++) retainQuery(client, api.courses.getPublic, { courseId: `c${i}` })();
  expect(watches.filter((w) => w.stop.mock.calls.length > 0).map((w) => w.args)).toEqual([0, 1, 2, 3, 4].map((i) => ({ courseId: `c${i}` })));
});
