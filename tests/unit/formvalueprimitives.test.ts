import { describe, expect, it } from "vitest";
import { isClockTime, isIsoDate, isOnStep, parseNumberInput } from "@/convex/formValuePrimitives";
describe("form value validation", () => {
  it("preserves calendar and clock rules", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isClockTime("23:59")).toBe(true);
    expect(isClockTime("24:00")).toBe(false);
  });
  it("normalizes both digit scripts", () => {
    expect(parseNumberInput("١٢٫٥")).toBe(12.5);
    expect(parseNumberInput("12,5")).toBe(12.5);
    expect(parseNumberInput("")).toBeUndefined();
    expect(parseNumberInput("oops")).toBeNull();
  });
  it("avoids floating-point step drift", () => {
    expect(isOnStep(0.3, 0.1)).toBe(true);
    expect(isOnStep(0.31, 0.1)).toBe(false);
  });
});
