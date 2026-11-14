import { expect, it } from "vitest";
import {
  classifyIntegrityReturn, makeIntegrityPolicy, requireIntegrityPolicy,
} from "../../convex/examIntegrityModel";

it("starts explicitly off and validates a bounded frozen grace policy", () => {
  expect(makeIntegrityPolicy()).toEqual({
    mode: "off", graceMs: 15_000, reviewThreshold: 3,
  });
  expect(() => makeIntegrityPolicy("warn", 0)).toThrow("INTEGRITY_POLICY_INVALID");
  expect(() => makeIntegrityPolicy("review", 120_001)).toThrow("INTEGRITY_POLICY_INVALID");
  expect(() => makeIntegrityPolicy("review", 4_000, 0)).toThrow("INTEGRITY_POLICY_INVALID");
  expect(() => requireIntegrityPolicy(undefined)).toThrow("INTEGRITY_POLICY_INVALID");
});

it("ignores false positives and connectivity for punitive review", () => {
  const p = makeIntegrityPolicy("review", 15_000, 3);
  expect(classifyIntegrityReturn(p, "visible", 2_000, 10)).toBe("grace");
  expect(classifyIntegrityReturn(p, "online", 100_000, 10)).toBe("connection");
  expect(classifyIntegrityReturn(p, "focus", undefined, 10)).toBe("observed");
  expect(classifyIntegrityReturn(p, "visible", 16_000, 0)).toBe("warning");
  expect(classifyIntegrityReturn(p, "visible", 16_000, 2)).toBe("review_required");
  expect(classifyIntegrityReturn(makeIntegrityPolicy("record"), "visible", 30_000, 10))
    .toBe("recorded");
  expect(classifyIntegrityReturn(makeIntegrityPolicy("warn"), "visible", 30_000, 10))
    .toBe("warning");
});
