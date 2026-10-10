import { describe, expect, it } from "vitest";
import { configuredRate } from "../../convex/integrationRate";

describe("configuredRate", () => {
  it("prefers the valid live configuration over the environment", () => {
    expect(configuredRate(42, "80", 300)).toBe(42);
  });

  it("uses a valid environment setting when the config is missing or invalid", () => {
    expect(configuredRate(undefined, "50", 300)).toBe(50);
    expect(configuredRate(0, "50", 300)).toBe(50);
    expect(configuredRate(100_001, "50", 300)).toBe(50);
    expect(configuredRate(1.5, "50", 300)).toBe(50);
  });

  it("uses the default if neither source is valid", () => {
    for (const raw of [undefined, "", "0", "-10", "2.5", "NaN", "100001"]) {
      expect(configuredRate(undefined, raw, 300)).toBe(300);
    }
  });

  it("accepts the existing inclusive limit range and numeric environment strings", () => {
    expect(configuredRate(1, undefined, 300)).toBe(1);
    expect(configuredRate(100_000, undefined, 300)).toBe(100_000);
    expect(configuredRate(undefined, "100000", 300)).toBe(100_000);
  });
});
