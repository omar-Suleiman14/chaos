// Writes the pull request performance comment (perf/results/pr-comment.md) from the
// results of `pnpm perf:check` and `pnpm test:correctness`. The workflow posts it as one
// comment per pull request and updates it on every push.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prComment, type Row } from "./lib/prSummary";

const results = join("perf", "results");
const read = <T,>(name: string): T | null => existsSync(join(results, name)) ? JSON.parse(readFileSync(join(results, name), "utf8")) as T : null;
const summary = read<{ rows: Row[]; problems: string[] }>("summary.json") ?? { rows: [], problems: ["perf:check did not run"] };
const correctness = read<{ failed: string[] }>("correctness.json");
const run = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : "local";
writeFileSync(join(results, "pr-comment.md"), prComment(summary.rows, summary.problems, correctness?.failed ?? null, run));
console.log(readFileSync(join(results, "pr-comment.md"), "utf8"));
