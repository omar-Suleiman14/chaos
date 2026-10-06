import { percentChange } from "./stats";

export type Row = { suite: string; metric: string; unit: "count" | "bytes" | "ms"; budget?: number; value?: number; status: string };

/** A user journey and the page people wait on; issues are filed per journey, not per metric. */
export type Journey = { key: string; title: string; page: string };

export const PERF_JOURNEYS: Journey[] = [
  { key: "dashboard", title: "Dashboard", page: "/dashboard" },
  { key: "form-editor", title: "Form editor", page: "/dashboard/forms/<id>" },
  { key: "quiz", title: "Quiz and form respondent", page: "/f/<shareId>" },
  { key: "lesson", title: "Lesson reader and editor", page: "/learn/<id>, /dashboard/learn/lessons/<id>" },
  { key: "course", title: "Course", page: "/learn/courses/<id>" },
  { key: "live", title: "Live", page: "/play" },
  { key: "card", title: "Card", page: "/card" },
  { key: "mcp", title: "MCP", page: "https://chaos.fail/mcp" },
  { key: "styles", title: "Stylesheets", page: "every page" },
];

/** First match wins: lesson and course editors before the form editor's generic "editor.". */
const RULES: [RegExp, string][] = [
  [/(^|\.)(mcp|journey\.mcpPersist)/, "mcp"],
  [/dashboard/i, "dashboard"],
  [/(lesson|giantLesson)/i, "lesson"],
  [/course/i, "course"],
  [/(keystroke|builder|editor\.|forms\.(editor|q\d+|max)|formCreate|formOpen|form\.(create|open)|largeForm|formEditor)/i, "form-editor"],
  [/(quiz|respondent|flow)/i, "quiz"],
  [/live/i, "live"],
  [/card/i, "card"],
];

/** The journey a benchmark belongs to; stylesheet totals and anything unmatched go to "styles". */
export function journeyOf(row: Pick<Row, "suite" | "metric">): Journey {
  const key = row.suite === "css" ? "styles" : RULES.find(([pattern]) => pattern.test(row.metric))?.[1] ?? "styles";
  return PERF_JOURNEYS.find((j) => j.key === key)!;
}

/** Regressed or vanished budgets, grouped by journey. */
export function regressionsByJourney(rows: Row[]): Map<string, Row[]> {
  const out = new Map<string, Row[]>();
  for (const row of rows) {
    if (row.status !== "regressed" && row.status !== "missing") continue;
    const key = journeyOf(row).key;
    out.set(key, [...(out.get(key) ?? []), row]);
  }
  return out;
}

const fmt = (value: number | undefined, unit: Row["unit"]) => value === undefined ? "not measured" : unit === "ms" ? `${value} ms` : unit === "bytes" ? `${value} B` : String(value);

/** The issue body: what regressed, from what to what, on which commit, and where the traces are. */
export function regressionBody(journey: Journey, rows: Row[], commit: string, runUrl: string): string {
  return [
    `**Affected page:** ${journey.page}`,
    "",
    "| Benchmark | Budget (main) | Nightly | Δ |",
    "|---|---:|---:|---:|",
    ...rows.map((r) => `| \`${r.suite}/${r.metric}\` | ${fmt(r.budget, r.unit)} | ${fmt(r.value, r.unit)} | ${r.budget !== undefined && r.value !== undefined ? percentChange(r.budget, r.value) : "missing"} |`),
    "",
    `**Commit:** \`${commit}\``,
    `**Traces and artifacts:** ${runUrl} (perf-results, nightly-browser: Playwright traces in test-results)`,
    "",
    "Reproduce with `pnpm perf` (Convex, census, bundles) or `pnpm exec playwright test -c playwright.perf.config.ts` (browser), then compare with `pnpm perf:check`.",
  ].join("\n");
}

/** The standing optimisation issue for a journey: current numbers and a measurable target. */
export function targetBody(journey: Journey, rows: Row[], targets: { p75: number; p95: number } | undefined): string {
  const mine = rows.filter((r) => journeyOf(r).key === journey.key && r.value !== undefined);
  const table = mine.slice(0, 40).map((r) => `| \`${r.suite}/${r.metric}\` | ${fmt(r.value, r.unit)} |`);
  return [
    `**Page:** ${journey.page}`,
    "",
    "One measurable target per journey, so an agent works on a number instead of on \"make Chaos faster\".",
    "",
    targets ? `**Real-user target:** p75 ≤ ${targets.p75} ms, p95 ≤ ${targets.p95} ms (perf/production-thresholds.json; current values in the latest production-health run).` : "**Target:** lower any budget below without raising another; correctness checks must pass.",
    "",
    "**Done when** a pull request lowers these budgets (`pnpm perf:ratchet`), the PR performance comment shows the win, and `pnpm test:correctness` passes.",
    "",
    "| Budget | Current |",
    "|---|---:|",
    ...table,
    mine.length > 40 ? `| … ${mine.length - 40} more in perf/baselines | |` : "",
    "",
    "Ask for the next step explicitly when you want more: find the next bottleneck, propose three options, include one unconventional approach.",
  ].join("\n");
}
