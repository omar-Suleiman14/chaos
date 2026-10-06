import { describe, expect, it } from "vitest";
import { percentChange, percentile, quantiles, regressions } from "@/scripts/lib/stats";
import { describeChanges } from "@/scripts/lib/mcpContract";
import { evaluateErrors, evaluateJourneys, evaluateStatus, type Thresholds } from "@/scripts/lib/health";
import productionThresholds from "@/perf/production-thresholds.json";
import { JOURNEYS } from "@/lib/journeys";
import { baselineProblems, classify, guard, HARNESS_LABEL } from "@/scripts/lib/perfGuard";
import { prComment } from "@/scripts/lib/prSummary";
import { journeyOf, PERF_JOURNEYS, regressionBody, regressionsByJourney, targetBody } from "@/scripts/lib/perfIssues";

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

describe("performance harness guard", () => {
  it("separates harness files from product code", () => {
    expect(classify(["perf/lib/convex.ts", "components/forms/FormRenderer.tsx", "convex/_generated/api.d.ts", "perf/README.md", "scripts/perf-ratchet.ts"]))
      .toEqual({ harness: ["perf/lib/convex.ts", "scripts/perf-ratchet.ts"], product: ["components/forms/FormRenderer.tsx"] });
  });

  it("blocks a change to both product code and the harness unless labelled", () => {
    const paths = ["lib/journeys.ts", "perf/browser/journeys.spec.ts"];
    expect(guard(paths, [], []).problems).toHaveLength(1);
    expect(guard(paths, [HARNESS_LABEL], []).problems).toEqual([]);
    expect(guard(["perf/browser/journeys.spec.ts"], [], []).problems).toEqual([]);
    expect(guard(["lib/journeys.ts", "perf/baselines/census.json"], [], []).problems).toEqual([]);
  });

  it("lets budgets fall but not rise, vanish or loosen quietly", () => {
    const base = { suite: "s", metrics: { a: { budget: 10, unit: "count" }, b: { budget: 5, unit: "count" }, c: { budget: 7, unit: "count" } } };
    const head = {
      suite: "s", tolerance: { bytes: 0.05 },
      metrics: {
        a: { budget: 9, unit: "count" },
        b: { budget: 6, unit: "count" },
        d: { budget: 1, unit: "count" },
      },
    };
    expect(baselineProblems(base, head, "s")).toEqual([
      "s: bytes tolerance widened from the default to 0.05",
      "s: b raised 5 → 6 without perf-ratchet raise and a reason",
      "s: budget c was removed",
    ]);
    const raised = { suite: "s", metrics: { ...base.metrics, b: { budget: 6, unit: "count", raised: { from: 5, reason: "Live data the view needs", at: "2026-10-06" } } } };
    expect(baselineProblems(base, raised, "s")).toEqual([]);
    expect(baselineProblems(null, head, "s")).toEqual([]);
    expect(baselineProblems(base, null, "s")).toEqual(["s: the whole baseline file was deleted"]);
  });
});

describe("pull request performance comment", () => {
  const rows = [
    { suite: "surfaces", metric: "dashboard.payloadBytes", unit: "bytes" as const, budget: 1000, value: 1070, status: "ok" },
    { suite: "surfaces", metric: "lessons.reader.payloadBytes", unit: "bytes" as const, budget: 1000, value: 820, status: "improved" },
    { suite: "census", metric: "editor.keystroke.commits", unit: "count" as const, budget: 2, value: 2, status: "ok" },
  ];

  it("leads with headline changes and the correctness verdict", () => {
    const body = prComment(rows, [], [], "https://run");
    expect(body.startsWith("<!-- chaos-perf-summary -->")).toBe(true);
    expect(body).toContain("- Dashboard payload `+7%`");
    expect(body).toContain("- Lesson load: reader payload `−18%`");
    expect(body).toContain("- Form input: React commits per keystroke `unchanged`");
    expect(body).toContain("- React commits unchanged");
    expect(body).toContain("- ✅ Correctness checks passed");
    expect(body).toContain("2 changed metrics");
  });

  it("never claims correctness that did not run or failed", () => {
    expect(prComment(rows, [], null, "x")).toContain("Correctness checks did not run");
    expect(prComment(rows, ["p"], ["correctness/integration"], "x")).toContain("🔴 Correctness checks failed: correctness/integration");
  });
});

describe("perf issues per journey", () => {
  const row = (suite: string, metric: string, status = "regressed", budget = 100, value = 130) => ({ suite, metric, unit: "count" as const, budget, value, status });

  it("maps every benchmark to the journey people wait on", () => {
    const cases: [string, string, string][] = [
      ["surfaces", "dashboard.payloadBytes", "dashboard"],
      ["journeys", "journey.formCreate.documentsRead", "form-editor"],
      ["builderKeystroke", "keystroke.q100.reactCommits", "form-editor"],
      ["census", "editor.keystroke.renders", "form-editor"],
      ["surfaces", "quizzes.respondent.payloadBytes", "quiz"],
      ["census", "giantLesson.mount.renders", "lesson"],
      ["surfaces", "courses.public.payloadBytes", "course"],
      ["census", "live.player.mount.renders", "live"],
      ["surfaces", "card.public.payloadBytes", "card"],
      ["surfaces", "mcp.listToolsBytes", "mcp"],
      ["journeys", "journey.mcpPersist.transactions", "mcp"],
      ["css", "css.universalSelectors", "styles"],
      ["bundles", "bundle.dashboard.firstLoadJs", "styles"],
    ];
    for (const [suite, metric, journey] of cases) expect(`${metric} → ${journeyOf({ suite, metric }).key}`).toBe(`${metric} → ${journey}`);
  });

  it("groups only regressions and missing budgets, and writes a complete issue", () => {
    const groups = regressionsByJourney([row("surfaces", "dashboard.payloadBytes"), row("surfaces", "dashboard.bytesRead", "ok"), row("census", "lesson.mount.renders", "missing")]);
    expect([...groups.keys()]).toEqual(["dashboard", "lesson"]);
    const body = regressionBody(PERF_JOURNEYS[0], groups.get("dashboard")!, "abc1234", "https://run");
    for (const part of ["/dashboard", "`surfaces/dashboard.payloadBytes`", "| 100 | 130 | +30% |", "abc1234", "https://run"]) expect(body).toContain(part);
    expect(targetBody(PERF_JOURNEYS[0], [row("surfaces", "dashboard.payloadBytes", "ok")], { p75: 2500, p95: 5000 })).toContain("p75 ≤ 2500 ms");
  });
});
