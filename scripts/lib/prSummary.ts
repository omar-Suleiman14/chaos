import { percentChange } from "./stats";

export type Row = { suite: string; metric: string; unit: "count" | "bytes" | "ms"; budget?: number; value?: number; status: string };

/** The handful of numbers a reviewer reads first, per journey. Everything else is in the table. */
export const HEADLINES: { label: string; suite: string; metric: string }[] = [
  { label: "Dashboard payload", suite: "surfaces", metric: "dashboard.payloadBytes" },
  { label: "Dashboard first-load JS", suite: "bundles", metric: "bundle.dashboard.firstLoadJsGzip" },
  { label: "Form editor payload", suite: "surfaces", metric: "forms.editor.payloadBytes" },
  { label: "Form input: React commits per keystroke", suite: "census", metric: "editor.keystroke.commits" },
  { label: "Form input: components rendered per keystroke", suite: "census", metric: "editor.keystroke.renders" },
  { label: "Lesson load: reader payload", suite: "surfaces", metric: "lessons.reader.payloadBytes" },
  { label: "Lesson load: components rendered", suite: "census", metric: "lesson.mount.renders" },
  { label: "Course payload", suite: "surfaces", metric: "courses.public.payloadBytes" },
  { label: "Quiz respondent payload", suite: "surfaces", metric: "quizzes.respondent.payloadBytes" },
  { label: "MCP tool list", suite: "surfaces", metric: "mcp.listToolsBytes" },
  { label: "Lesson load (Chromium p75)", suite: "journeys-browser", metric: "browser.lesson.read.p75" },
  { label: "Form input latency (Chromium p75)", suite: "keystroke-browser", metric: "keystroke.q100.keydownToPaint.p75" },
];

function describe(row: Row | undefined): string | null {
  if (!row || row.value === undefined) return null;
  if (row.budget === undefined) return "new";
  if (row.value === row.budget) return "unchanged";
  return percentChange(row.budget, row.value);
}

/**
 * The pull request comment: headline changes against main's budgets, the
 * correctness verdict, and every changed metric in a collapsed table.
 */
export function prComment(rows: Row[], problems: string[], correctnessFailed: string[] | null, runUrl: string): string {
  const find = (suite: string, metric: string) => rows.find((r) => r.suite === suite && r.metric === metric);
  const lines = ["<!-- chaos-perf-summary -->", "### Performance", ""];
  const headlines = HEADLINES.map((h) => ({ h, d: describe(find(h.suite, h.metric)) })).filter((x) => x.d !== null);
  for (const { h, d } of headlines) lines.push(`- ${h.label} \`${d}\``);
  if (!headlines.length) lines.push("- No headline metrics were measured in this run.");
  const commits = rows.filter((r) => /\.commits$/.test(r.metric) && r.value !== undefined);
  if (commits.length) lines.push(`- React commits ${commits.every((r) => r.value === r.budget) ? "unchanged" : "changed (see table)"}`);
  lines.push(
    correctnessFailed === null ? "- ⚠️ Correctness checks did not run"
      : correctnessFailed.length ? `- 🔴 Correctness checks failed: ${correctnessFailed.join(", ")}`
      : "- ✅ Correctness checks passed",
  );
  lines.push("", problems.length ? `**${problems.length} budget problem${problems.length === 1 ? "" : "s"}.**` : "All budgets hold.");

  const changed = rows.filter((r) => r.value !== undefined && r.budget !== undefined && r.value !== r.budget);
  if (changed.length) {
    lines.push("", `<details><summary>${changed.length} changed metric${changed.length === 1 ? "" : "s"}</summary>`, "", "| Metric | main | this PR | Δ |", "|---|---:|---:|---:|");
    for (const r of changed.sort((a, b) => Math.abs(b.value! / b.budget! - 1) - Math.abs(a.value! / a.budget! - 1))) {
      lines.push(`| \`${r.suite}/${r.metric}\` | ${r.budget} | ${r.value} | ${percentChange(r.budget!, r.value!)} |`);
    }
    lines.push("", "</details>");
  }
  if (problems.length) lines.push("", "<details><summary>Problems</summary>", "", ...problems.map((p) => `- ${p}`), "", "</details>");
  lines.push("", `Compared with the budgets on main (perf/baselines). [Run and artifacts](${runUrl}).`);
  return lines.join("\n") + "\n";
}
