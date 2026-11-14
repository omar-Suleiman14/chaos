import { expect, it } from "vitest";
import { defaultExamSettings } from "../../convex/examSettingsModel";
import { freezeResultPolicy, resultStatus } from "../../convex/examResultModel";

const final = { state: "auto_final" as const, finalPercentBasisPoints: 8000 };
const pending = { state: "needs_manual" as const };

it("defaults unknown legacy policies to manual withheld, never immediate", () => {
  expect(freezeResultPolicy(undefined)).toEqual({
    visibility: "manual", passingPercent: 50,
  });
  expect(resultStatus(final, undefined, false, 100)).toBe("withheld");
  expect(resultStatus(final, undefined, true, 100)).toBe("released");
});

it("never reveals an unfinished written grade under any release mode", () => {
  for (const visibility of ["manual", "immediate"] as const) {
    const policy = freezeResultPolicy({ ...defaultExamSettings, resultVisibility: visibility });
    expect(resultStatus(pending, policy, true, 1_000)).toBe("grading");
    expect(resultStatus(null, policy, true, 1_000)).toBe("grading");
  }
});

it("uses frozen closing timestamp and prevents fallback from unlocking malformed scheduling", () => {
  const policy = freezeResultPolicy({
    ...defaultExamSettings, mode: "scheduled", resultVisibility: "after_close",
    opensAt: 1_000, closesAt: 2_000,
  });
  expect(resultStatus(final, policy, true, 1_999)).toBe("withheld");
  expect(resultStatus(final, policy, false, 2_000)).toBe("released");
  expect(freezeResultPolicy({
    ...defaultExamSettings, resultVisibility: "after_close",
  }).visibility).toBe("manual");
});
