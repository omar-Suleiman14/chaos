import { describe, expect, it } from "vitest";
import { MAX_TIME_LIMIT, MIN_TIME_LIMIT } from "../../convex/liveLogic";
import { validateTimeLimit } from "../../convex/liveTimeLimit";

describe("live game time-limit validation", () => {
  it("accepts both inclusive limits", () => {
    expect(() => validateTimeLimit(MIN_TIME_LIMIT)).not.toThrow();
    expect(() => validateTimeLimit(MAX_TIME_LIMIT)).not.toThrow();
  });

  it("rejects outside, fractional and nonfinite settings with the existing error", () => {
    for (const value of [MIN_TIME_LIMIT - 1, MAX_TIME_LIMIT + 1, MIN_TIME_LIMIT + 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => validateTimeLimit(value)).toThrow(`LIVE_INVALID: Choose between ${MIN_TIME_LIMIT} and ${MAX_TIME_LIMIT} seconds.`);
    }
  });
});
