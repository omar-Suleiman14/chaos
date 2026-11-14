import { expect, it } from "vitest";
import { transitionExamAttempt } from "../../convex/examAttemptState";
it("permits one terminal transition and treats same-state retries as no-ops", () => {
  expect(transitionExamAttempt("in_progress", "submitted")).toBe(true);
  expect(transitionExamAttempt("submitted", "submitted")).toBe(false);
  expect(() => transitionExamAttempt("submitted", "expired")).toThrow("ATTEMPT_FINALIZED");
  expect(() => transitionExamAttempt("void", "submitted")).toThrow("ATTEMPT_FINALIZED");
});
