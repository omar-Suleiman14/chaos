import { describe, expect, it } from "vitest";
import { effectiveResponseCap } from "../../convex/responseCap";

describe("effectiveResponseCap", () => {
  it("keeps unlimited when neither level defines a cap", () => {
    expect(effectiveResponseCap(null, null)).toBeNull();
  });

  it("uses only the configured cap when the other level is unlimited", () => {
    expect(effectiveResponseCap(100, null)).toBe(100);
    expect(effectiveResponseCap(null, 12)).toBe(12);
  });

  it("enforces whichever of the two caps is stricter", () => {
    expect(effectiveResponseCap(100, 12)).toBe(12);
    expect(effectiveResponseCap(25, 50)).toBe(25);
    expect(effectiveResponseCap(20, 20)).toBe(20);
    expect(effectiveResponseCap(0, 50)).toBe(0);
  });
});
