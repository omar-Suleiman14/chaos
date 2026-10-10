import { describe, expect, it } from "vitest";
import { randomPin } from "@/convex/livePin";
describe("live PINs", () => {
  it("stays six decimal digits in the same range", () => {
    for (let i = 0; i < 50; i++) {
      const pin = randomPin();
      expect(pin).toMatch(/^[1-9][0-9]{5}$/);
      expect(Number(pin)).toBeGreaterThanOrEqual(100000);
      expect(Number(pin)).toBeLessThan(1000000);
    }
  });
});
