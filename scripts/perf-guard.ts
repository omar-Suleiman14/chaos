// Pull request guard for the performance harness (scripts/lib/perfGuard.ts).
//
//   BASE_REF=origin/main PR_LABELS="a,b" tsx scripts/perf-guard.ts
//
// Fails when one change edits both product code and the harness without the
// perf-harness-change label, or when a budget in perf/baselines is raised,
// removed or loosened without `perf-ratchet raise` and a recorded reason.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { guard, baselineProblems } from "./lib/perfGuard";

const base = process.env.BASE_REF ?? "origin/main";
const labels = (process.env.PR_LABELS ?? "").split(",").map((l) => l.trim()).filter(Boolean);
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" });

const mergeBase = git("merge-base", base, "HEAD").trim();
const paths = git("diff", "--name-only", mergeBase, "HEAD").split("\n").map((p) => p.trim()).filter(Boolean);

const baselineIssues = paths.filter((p) => /^perf\/baselines\/[^/]+\.json$/.test(p)).flatMap((path) => {
  const suite = path.replace(/^perf\/baselines\/|\.json$/g, "");
  let before = null;
  try { before = JSON.parse(git("show", `${mergeBase}:${path}`)); } catch { /* new suite */ }
  const after = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  return baselineProblems(before, after, suite);
});

const { harness, product, problems } = guard(paths, labels, baselineIssues);
console.log(`perf-guard: ${paths.length} files changed; ${harness.length} harness, ${product.length} product.`);
for (const p of problems) console.error(`✗ ${p}`);
if (!problems.length) console.log("perf-guard: the harness and budgets are untouched or changed on their own.");
process.exitCode = problems.length ? 1 : 0;
