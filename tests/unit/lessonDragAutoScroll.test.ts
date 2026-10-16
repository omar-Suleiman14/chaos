import { describe, expect, it } from "vitest";
import { autoScrollVelocity } from "@/components/learn/editor/dragFeedback";

describe("drag autoscroll", () => {
  it("is still away from the edges and speeds up towards them", () => {
    expect(autoScrollVelocity(450, 0, 900)).toBe(0);
    expect(autoScrollVelocity(850, 0, 900)).toBeGreaterThan(0);
    expect(autoScrollVelocity(50, 0, 900)).toBeLessThan(0);
    expect(autoScrollVelocity(895, 0, 900)).toBeGreaterThan(autoScrollVelocity(850, 0, 900));
    expect(autoScrollVelocity(-40, 0, 900)).toBe(-22);
    expect(autoScrollVelocity(2000, 0, 900)).toBe(22);
  });
  it("shrinks the edge zone in short scroll areas and never divides by zero", () => {
    expect(autoScrollVelocity(100, 0, 200)).toBe(0);
    expect(autoScrollVelocity(10, 0, 0)).toBe(0);
  });
});
