import { describe, expect, it } from "vitest";
import { defaultExamSettings, validateExamSettings } from "../../convex/examSettingsModel";

const now = Date.UTC(2026, 10, 14);
const scheduled = {
  ...defaultExamSettings,
  mode: "scheduled" as const,
  opensAt: now + 60_000,
  closesAt: now + 3_600_000,
  resultVisibility: "after_close" as const,
};
describe("doctor exam setting validation", () => {
  it("accepts valid anytime and scheduled policies", () => {
    expect(validateExamSettings(defaultExamSettings, now)).toEqual(defaultExamSettings);
    expect(validateExamSettings(scheduled, now)).toEqual(scheduled);
  });
  it("rejects invalid scheduling and time windows", () => {
    expect(() => validateExamSettings({ ...scheduled, closesAt: scheduled.opensAt }, now)).toThrow("Closing time");
    expect(() => validateExamSettings({ ...scheduled, closesAt: now - 1 }, now)).toThrow("Closing time");
    expect(() => validateExamSettings({ ...scheduled, opensAt: undefined }, now)).toThrow("timestamps");
    expect(() => validateExamSettings({ ...scheduled, closesAt: now + 367 * 86400000 }, now)).toThrow("366 days");
    expect(() => validateExamSettings({ ...defaultExamSettings, opensAt: now }, now)).toThrow("Anytime");
    expect(() => validateExamSettings({ ...defaultExamSettings, resultVisibility: "after_close" }, now))
      .toThrow("scheduled closing time");
  });
  it("validates duration, attempt counts and pass threshold precisely", () => {
    for (const durationMinutes of [-1, 0, 1.2, 481, Infinity])
      expect(() => validateExamSettings({ ...scheduled, durationMinutes }, now)).toThrow("Duration");
    for (const maxAttempts of [0, 1.5, 4, NaN])
      expect(() => validateExamSettings({ ...scheduled, maxAttempts }, now)).toThrow("Attempts");
    for (const passingPercent of [-1, 100.001, 101, Infinity, NaN])
      expect(() => validateExamSettings({ ...scheduled, passingPercent }, now)).toThrow("Passing");
    expect(validateExamSettings({ ...scheduled, passingPercent: 79.25 }, now).passingPercent).toBe(79.25);
  });
});
