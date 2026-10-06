// Turns nightly perf results into GitHub issues, one per journey; no model involved.
//
//   tsx scripts/perf-issues.ts regressions --results dirA,dirB   nightly: open/update/close per-journey regression issues
//   tsx scripts/perf-issues.ts targets [--journeys dashboard,lesson]   ensure one optimisation issue per journey
//
// Each regression issue names the benchmark, budget and nightly value, the commit, the run with
// its traces and artifacts, and the affected page. A journey that is green again gets its issue closed.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { reportHealthy, reportProblem } from "./lib/issues";
import { journeyOf, PERF_JOURNEYS, regressionBody, regressionsByJourney, targetBody, type Row } from "./lib/perfIssues";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const command = process.argv[2];
const commit = (process.env.GITHUB_SHA ?? "local").slice(0, 7);
const runUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : "local run";

function rowsFrom(dirs: string[]): Row[] {
  return dirs.flatMap((dir) => {
    const file = join(dir, "summary.json");
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { rows: Row[] }).rows : [];
  });
}

/** Current budgets, for target issues: every metric in perf/baselines with its value. */
function budgetRows(): Row[] {
  const dir = join("perf", "baselines");
  return readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => {
    const b = JSON.parse(readFileSync(join(dir, f), "utf8")) as { suite: string; scheduled?: boolean; metrics: Record<string, { budget: number; unit: Row["unit"] }> };
    return Object.entries(b.metrics).map(([metric, m]) => ({ suite: b.suite, metric, unit: m.unit, value: m.budget, budget: m.budget, status: "ok" }));
  });
}

async function regressions() {
  const dirs = (arg("--results") ?? join("perf", "results")).split(",").filter(Boolean);
  const rows = rowsFrom(dirs);
  if (!rows.length) { console.log("perf-issues: no results; nothing to report."); return; }
  const byJourney = regressionsByJourney(rows);
  for (const journey of PERF_JOURNEYS) {
    const key = { marker: `perf-journey-${journey.key}`, title: `Performance regression: ${journey.title}`, labels: ["perf-regression"] };
    const regressed = byJourney.get(journey.key);
    if (regressed?.length) {
      console.log(`✗ ${journey.title}: ${regressed.length} regressed`);
      await reportProblem(key, regressionBody(journey, regressed, commit, runUrl));
    } else if (rows.some((r) => journeyOf(r).key === journey.key)) {
      // Only a journey this run actually measured can be declared healthy.
      await reportHealthy(key, `Within budget again on \`${commit}\`: ${runUrl}`);
    }
  }
}

async function targets() {
  const thresholds = JSON.parse(readFileSync(join("perf", "production-thresholds.json"), "utf8")) as { journeys: Record<string, { p75: number; p95: number }> };
  const realUser: Record<string, string> = { dashboard: "dashboard", "form-editor": "form.open", quiz: "quiz.question", lesson: "lesson.read", course: "course.modules", live: "live.join" };
  const only = arg("--journeys")?.split(",");
  const rows = budgetRows();
  for (const journey of PERF_JOURNEYS.filter((j) => !only || only.includes(j.key))) {
    const key = { marker: `perf-target-${journey.key}`, title: `Optimise: ${journey.title}`, labels: ["perf-target"] };
    // reportProblem comments on an open issue instead of duplicating it, so this is safe to rerun.
    await reportProblem(key, targetBody(journey, rows, thresholds.journeys[realUser[journey.key]]));
  }
}

(command === "regressions" ? regressions() : command === "targets" ? targets() : Promise.reject(new Error("Usage: perf-issues regressions|targets")))
  .catch((error) => { console.error(error); process.exitCode = 1; });
