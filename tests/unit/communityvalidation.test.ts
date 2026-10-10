import { describe, expect, it } from "vitest";
import { integer, text } from "@/convex/learnCommunityValidation";
describe("community input validators", () => {
  it("trims and preserves text limits", () => {
    expect(text("  welcome  ")).toBe("welcome");
    expect(() => text("   ")).toThrow("Invalid text length");
    expect(() => text("abc", 2)).toThrow("Invalid text length");
    expect(text("abc", 3)).toBe("abc");
  });
  it("keeps safe sequence/revision checks", () => {
    expect(() => integer(0)).not.toThrow();
    expect(() => integer(5, 5)).not.toThrow();
    for (const n of [-1, 1.5, Infinity, Number.NaN]) {
      expect(() => integer(n)).toThrow("Invalid sequence or revision");
    }
  });
});
