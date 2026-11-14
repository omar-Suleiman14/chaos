import { expect, it } from "vitest";
import { boundedReviewText, extendedDeadline } from "../../convex/examInvigilationModel";

it("validates bounded human reasons without inferring a cheating verdict", () => {
  expect(boundedReviewText("  Student changed mobile app  ")).toBe("Student changed mobile app");
  expect(() => boundedReviewText("too short")).toThrow("INVALID_NOTE");
  expect(() => boundedReviewText("x".repeat(501))).toThrow("INVALID_NOTE");
});

it("extends only an active server deadline within the hard exam window", () => {
  const a = { startedAt: 100_000, deadlineAt: 100_000 + 30 * 60_000 };
  expect(extendedDeadline(a, 110_000, 5)).toBe(a.deadlineAt + 300_000);
  expect(() => extendedDeadline(a, a.deadlineAt, 5)).toThrow("ATTEMPT_TIMED_OUT");
  expect(() => extendedDeadline(a, 110_000, 0)).toThrow("INVALID_EXTENSION");
  expect(() => extendedDeadline(a, 110_000, 121)).toThrow("INVALID_EXTENSION");
  expect(() => extendedDeadline(a, 110_000, 5, a.deadlineAt))
    .toThrow("EXTENSION_LIMIT");
});
