import { describe, expect, it } from "vitest";
import { auditFlags, evaluateFlag, FLAGS, flagBucket, type FlagDefinition } from "@/lib/flags";

describe("flag evaluation", () => {
  it("uses the default without a rollout and for signed-out visitors below 100%", () => {
    expect(evaluateFlag("editor.new", null, "user_1")).toBe(FLAGS["editor.new"].defaultValue);
    expect(evaluateFlag("editor.new", { percent: 99, allow: [] }, null)).toBe(false);
    expect(evaluateFlag("editor.new", { percent: 100, allow: [] }, null)).toBe(true);
  });

  it("keeps people in the ramp as it widens", () => {
    const users = Array.from({ length: 400 }, (_, i) => `user_${i}`);
    const at10 = users.filter((u) => evaluateFlag("editor.new", { percent: 10, allow: [] }, u));
    const at20 = users.filter((u) => evaluateFlag("editor.new", { percent: 20, allow: [] }, u));
    expect(at10.every((u) => at20.includes(u))).toBe(true);
    expect(at10.length).toBeGreaterThan(15);
    expect(at10.length).toBeLessThan(70);
    expect(evaluateFlag("editor.new", { percent: 0, allow: ["user_3"] }, "user_3")).toBe(true);
    // Buckets differ per flag, so one person is not in every early ramp.
    expect(users.some((u) => flagBucket("editor.new", u) !== flagBucket("live.changes", u))).toBe(true);
  });
});

describe("flag expiry audit", () => {
  const flag = (patch: Partial<FlagDefinition>): FlagDefinition => ({ description: "x", owner: "o", kind: "release", createdAt: "2026-10-01", expiresAt: "2026-12-01", defaultValue: false, ...patch });

  it("warns before expiry and fails after it", () => {
    expect(auditFlags({ a: flag({}) }, new Date("2026-10-06"))).toEqual([]);
    expect(auditFlags({ a: flag({}) }, new Date("2026-11-20"))).toMatchObject([{ key: "a", level: "warning" }]);
    expect(auditFlags({ a: flag({}) }, new Date("2026-12-03"))).toMatchObject([{ key: "a", level: "error", message: expect.stringMatching(/expired 2 days ago/) }]);
  });

  it("requires a bounded expiry for ramps but not for ops switches", () => {
    expect(auditFlags({ a: flag({ expiresAt: undefined }) }, new Date("2026-10-06"))).toMatchObject([{ level: "error" }]);
    expect(auditFlags({ a: flag({ expiresAt: "2027-06-01" }) }, new Date("2026-10-06"))).toMatchObject([{ level: "error", message: expect.stringMatching(/longer than 90 days/) }]);
    expect(auditFlags({ a: flag({ kind: "ops", expiresAt: undefined }) }, new Date("2026-10-06"))).toEqual([]);
  });

  it("the registry passes its own policy today", () => {
    expect(auditFlags(FLAGS, new Date("2026-10-06")).filter((f) => f.level === "error")).toEqual([]);
  });
});
