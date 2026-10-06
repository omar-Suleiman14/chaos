import { describe, expect, it } from "vitest";
import { percentChange, percentile, quantiles, regressions } from "@/scripts/lib/stats";
import { describeChanges } from "@/scripts/lib/mcpContract";
import { evaluateErrors, evaluateJourneys, evaluateStatus, type Thresholds } from "@/scripts/lib/health";
import productionThresholds from "@/perf/production-thresholds.json";
import { JOURNEYS } from "@/lib/journeys";

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

describe("production health thresholds", () => {
  const t: Thresholds = { minimumSamples: 30, regression: { p75: 0.3, p95: 0.5, floorMs: 150 }, journeys: { dashboard: { p75: 2500, p95: 5000 } }, errors: { ratio: 2, minimum: 20 } };
  const stats = (journey: string, n: number, p75: number, p95: number) => ({ journey, n, p50: p75 / 2, p75, p95 });

  it("flags limits and regressions only with enough samples", () => {
    expect(evaluateJourneys([stats("dashboard", 29, 9000, 9000)], [], t)).toEqual([]);
    const problems = evaluateJourneys([stats("dashboard", 100, 2600, 3000)], [stats("dashboard", 500, 1800, 3000)], t);
    expect(problems.map((p) => p.kind)).toEqual(["limit", "regression"]);
    // +30% but under the 150 ms floor is noise.
    expect(evaluateJourneys([stats("quiz.next", 100, 190, 300)], [stats("quiz.next", 100, 100, 300)], t)).toEqual([]);
  });

  it("compares errors with the weekly daily average", () => {
    expect(evaluateErrors(19, 0, t)).toEqual([]);
    expect(evaluateErrors(40, 140, t)).toEqual([]);
    expect(evaluateErrors(41, 140, t)).toHaveLength(1);
  });

  it("reports degraded and down services from the status feed", () => {
    expect(evaluateStatus([
      { service: "mcp", observed: true, status: "operational", summary: null },
      { service: "search", observed: true, status: "degraded", summary: "Slow" },
    ])).toEqual([{ journey: "search", kind: "status", detail: "degraded: Slow" }]);
  });

  it("has a limit for every journey the app marks", () => {
    expect(Object.keys(productionThresholds.journeys).sort()).toEqual(Object.keys(JOURNEYS).sort());
  });
});
