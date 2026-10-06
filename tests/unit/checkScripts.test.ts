import { describe, expect, it } from "vitest";
import { percentChange, percentile, quantiles, regressions } from "@/scripts/lib/stats";
import { describeChanges } from "@/scripts/lib/mcpContract";

describe("percentiles", () => {
  it("uses nearest rank", () => {
    const samples = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
    expect(percentile(samples, 50)).toBe(5);
    expect(percentile(samples, 95)).toBe(10);
    expect(percentile([42], 75)).toBe(42);
    expect(percentile([], 50)).toBeNaN();
    expect(quantiles([1, 2, 3, 4])).toEqual({ p50: 2, p75: 3, p95: 4 });
  });
});

describe("regressions", () => {
  it("flags only changes beyond the threshold and the absolute floor", () => {
    const before = { "a.p95": 100, "b.p95": 4, "c.p95": 100 };
    const after = { "a.p95": 180, "b.p95": 9, "c.p95": 120, "new.p95": 999 };
    expect(regressions(before, after, 0.5, 20)).toEqual([{ metric: "a.p95", before: 100, after: 180, ratio: 1.8 }]);
    expect(percentChange(100, 82)).toBe("−18%");
    expect(percentChange(100, 107)).toBe("+7%");
  });
});

describe("MCP contract drift", () => {
  it("names added, removed and changed tools", () => {
    const before = { keep: { description: "a" }, gone: { description: "x" } };
    const after = { keep: { description: "b" }, added: { description: "y" } };
    expect(describeChanges(before, after)).toEqual(["+ added (added)", "- gone (removed)", "~ keep: description changed"]);
  });
});
