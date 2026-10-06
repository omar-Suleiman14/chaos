// Compares perf/results with the checked-in budgets in perf/baselines.
//
//   tsx scripts/perf-ratchet.ts check  [--suites a,b] [--allow-new]   fail on regressions (CI)
//   tsx scripts/perf-ratchet.ts update [--suites a,b]   lower budgets after genuine wins, add new metrics
//   tsx scripts/perf-ratchet.ts raise <metric> --reason "why"   the only way a budget goes up
//
// Budgets only move down on their own. Raising one is explicit, carries a
// reason and is flagged in the PR summary (perf/README.md, "Ratchets").
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Unit = "count" | "bytes" | "ms";
type Result = { suite: string; failed: string[]; metrics: Record<string, { value: number; unit: Unit }> };
type Budget = { budget: number; unit: Unit; raised?: { from: number; reason: string; at: string } };
type Baseline = { suite: string; tolerance?: Partial<Record<Unit, number>>; metrics: Record<string, Budget> };
type Row = { suite: string; metric: string; unit: Unit; budget?: number; value?: number; status: "ok" | "regressed" | "improved" | "new" | "missing"; raised?: Budget["raised"] };

const RESULTS = join("perf", "results"), BASELINES = join("perf", "baselines");
/** Deterministic counts are exact; bytes allow OS/toolchain jitter; timings are noisy and gate only scheduled runs. */
const DEFAULT_TOLERANCE: Record<Unit, number> = { count: 0, bytes: 0.01, ms: 0.3 };

const read = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const write = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };

function suites(dir: string) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("summary")).map((f) => f.replace(/\.json$/, "")) : [];
}
function selected() {
  const only = arg("--suites")?.split(",").filter(Boolean);
  return only ?? [...new Set([...suites(BASELINES), ...suites(RESULTS)])].sort();
}
const baselineOf = (suite: string): Baseline => existsSync(join(BASELINES, `${suite}.json`)) ? read<Baseline>(join(BASELINES, `${suite}.json`)) : { suite, metrics: {} };
const resultOf = (suite: string): Result | null => existsSync(join(RESULTS, `${suite}.json`)) ? read<Result>(join(RESULTS, `${suite}.json`)) : null;

function compare(suite: string): { rows: Row[]; problems: string[] } {
  const baseline = baselineOf(suite), result = resultOf(suite), rows: Row[] = [], problems: string[] = [];
  if (!result) return { rows, problems: [`${suite}: no results; the suite did not run`] };
  for (const failed of result.failed) problems.push(`${suite}: ${failed} failed, so its measurements cannot be trusted`);
  const tolerance = { ...DEFAULT_TOLERANCE, ...baseline.tolerance };
  for (const [metric, b] of Object.entries(baseline.metrics)) {
    const current = result.metrics[metric];
    if (!current) { rows.push({ suite, metric, unit: b.unit, budget: b.budget, status: "missing" }); problems.push(`${suite}: ${metric} is budgeted but was not measured`); continue; }
    const limit = b.budget * (1 + tolerance[b.unit]);
    const status = current.value > limit ? "regressed" : current.value < b.budget * (1 - tolerance[b.unit]) || (tolerance[b.unit] === 0 && current.value < b.budget) ? "improved" : "ok";
    if (status === "regressed") problems.push(`${suite}: ${metric} ${fmt(current.value, b.unit)} exceeds budget ${fmt(b.budget, b.unit)}`);
    rows.push({ suite, metric, unit: b.unit, budget: b.budget, value: current.value, status, raised: b.raised });
  }
  for (const [metric, current] of Object.entries(result.metrics)) {
    if (baseline.metrics[metric]) continue;
    rows.push({ suite, metric, unit: current.unit, value: current.value, status: "new" });
    // Scheduled browser suites start without budgets; their first run proposes them.
    if (!process.argv.includes("--allow-new")) problems.push(`${suite}: ${metric} has no budget; run pnpm perf:ratchet to add it`);
  }
  return { rows, problems };
}

function fmt(value: number, unit: Unit) {
  if (unit === "bytes") return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(2)} MiB` : value >= 1024 ? `${(value / 1024).toFixed(1)} KiB` : `${value} B`;
  if (unit === "ms") return `${value.toFixed(1)} ms`;
  return String(value);
}
const delta = (r: Row) => r.budget && r.value !== undefined ? `${r.value >= r.budget ? "+" : "−"}${(Math.abs(r.value / r.budget - 1) * 100).toFixed(1)}%` : "";

function summary(rows: Row[], problems: string[]) {
  const icon = { ok: "", regressed: "🔴", improved: "🟢", new: "🆕", missing: "⚠️" } as const;
  const changed = rows.filter((r) => r.status !== "ok" || (r.value !== undefined && r.budget !== undefined && r.value !== r.budget));
  const raised = rows.filter((r) => r.raised);
  const lines = [
    "## Performance budgets",
    "",
    problems.length ? `**${problems.length} problem${problems.length === 1 ? "" : "s"}.** Correctness checks run first; a failing suite counts as a failure here.` : "All budgets hold. Correctness checks passed.",
    "",
    `${rows.length} metrics in ${new Set(rows.map((r) => r.suite)).size} suites; ${rows.filter((r) => r.status === "improved").length} improved, ${rows.filter((r) => r.status === "regressed").length} regressed.`,
  ];
  if (changed.length) {
    lines.push("", "| | Metric | Budget | Now | Δ |", "|---|---|---:|---:|---:|");
    for (const r of changed) lines.push(`| ${icon[r.status]} | \`${r.suite}/${r.metric}\` | ${r.budget === undefined ? "—" : fmt(r.budget, r.unit)} | ${r.value === undefined ? "—" : fmt(r.value, r.unit)} | ${delta(r)} |`);
  }
  if (raised.length) {
    lines.push("", "### Budgets raised in this branch", "");
    for (const r of raised) lines.push(`- \`${r.suite}/${r.metric}\`: ${fmt(r.raised!.from, r.unit)} → ${fmt(r.budget!, r.unit)}. ${r.raised!.reason}`);
  }
  if (rows.some((r) => r.status === "improved")) lines.push("", "Lock in wins with `pnpm perf:ratchet` and commit `perf/baselines`.");
  if (problems.length) lines.push("", "<details><summary>Problems</summary>", "", ...problems.map((p) => `- ${p}`), "", "</details>");
  return lines.join("\n") + "\n";
}

const command = process.argv[2] ?? "check";
mkdirSync(BASELINES, { recursive: true });
if (command === "check") {
  const all = selected().map(compare);
  const rows = all.flatMap((a) => a.rows), problems = all.flatMap((a) => a.problems);
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(join(RESULTS, "summary.md"), summary(rows, problems));
  write(join(RESULTS, "summary.json"), { problems, rows });
  for (const p of problems) console.error(`✗ ${p}`);
  for (const r of rows.filter((x) => x.status === "improved")) console.log(`↓ ${r.suite}/${r.metric}: ${fmt(r.budget!, r.unit)} → ${fmt(r.value!, r.unit)} (${delta(r)}); run pnpm perf:ratchet`);
  console.log(problems.length ? `perf: ${problems.length} problems` : `perf: ${rows.length} metrics within budget`);
  process.exitCode = problems.length ? 1 : 0;
} else if (command === "update") {
  for (const suite of selected()) {
    const result = resultOf(suite);
    if (!result || !Object.keys(result.metrics).length) continue;
    if (result.failed.length) { console.error(`✗ ${suite}: not ratcheting while tests fail`); process.exitCode = 1; continue; }
    const baseline = baselineOf(suite), tolerance = { ...DEFAULT_TOLERANCE, ...baseline.tolerance };
    let lowered = 0, added = 0;
    for (const [metric, current] of Object.entries(result.metrics)) {
      const b = baseline.metrics[metric];
      if (!b) { baseline.metrics[metric] = { budget: current.value, unit: current.unit }; added++; continue; }
      // A win must clear the noise band to count; deterministic counts ratchet on any decrease.
      const genuine = tolerance[b.unit] === 0 ? current.value < b.budget : current.value < b.budget * (1 - tolerance[b.unit]);
      if (genuine) { baseline.metrics[metric] = { budget: current.value, unit: b.unit }; lowered++; }
    }
    baseline.metrics = Object.fromEntries(Object.entries(baseline.metrics).sort(([a], [b]) => a.localeCompare(b)));
    write(join(BASELINES, `${suite}.json`), baseline);
    console.log(`${suite}: ${lowered} lowered, ${added} added`);
  }
} else if (command === "raise") {
  const metric = process.argv[3], reason = arg("--reason");
  if (!metric || !reason || reason.length < 15) throw new Error('Usage: perf-ratchet raise <metric> --reason "why this cost is worth it"');
  const suite = selected().find((s) => baselineOf(s).metrics[metric]);
  if (!suite) throw new Error(`No budget named ${metric}`);
  const baseline = baselineOf(suite), current = resultOf(suite)?.metrics[metric];
  if (!current) throw new Error(`${metric} was not measured; run pnpm perf first`);
  const from = baseline.metrics[metric].budget;
  if (current.value <= from) throw new Error(`${metric} is within budget; nothing to raise`);
  baseline.metrics[metric] = { budget: current.value, unit: current.unit, raised: { from, reason, at: new Date().toISOString().slice(0, 10) } };
  write(join(BASELINES, `${suite}.json`), baseline);
  console.log(`${suite}/${metric}: ${from} → ${current.value}`);
} else throw new Error(`Unknown command ${command}`);
