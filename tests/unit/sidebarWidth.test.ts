import { describe, expect, it } from "vitest";
import { SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT, clampWidth } from "../../components/workspace/sidebarWidth";

describe("sidebar width policy", () => {
  it("keeps the existing dimensions", () => {
    expect([SIDEBAR_MIN, SIDEBAR_DEFAULT, SIDEBAR_MAX]).toEqual([200, 256, 420]);
  });
  it("clamps saved and pointer widths without changing in-range values", () => {
    expect(clampWidth(-100)).toBe(200);
    expect(clampWidth(250)).toBe(250);
    expect(clampWidth(1000)).toBe(420);
  });
});
