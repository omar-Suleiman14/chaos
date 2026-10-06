// Opens, comments on or closes the one GitHub issue that belongs to a scheduled check.
//
//   tsx scripts/check-report.ts --key mcp-synthetic --title "MCP synthetic check failing" \
//     --label production-health --failed true --body-file perf/results/mcp-synthetic.md
//
// --failed true opens the issue (or comments on the open one); false closes it.
// No model decides anything here: thresholds live in the scripts that produce the body.
import { existsSync, readFileSync } from "node:fs";
import { reportHealthy, reportProblem } from "./lib/issues";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const key = arg("--key"), title = arg("--title"), label = arg("--label") ?? "production-health";
if (!key || !title) throw new Error("--key and --title are required");
const failed = arg("--failed") === "true";
const file = arg("--body-file");
const run = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : "local run";
const sha = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : "local";
const body = [file && existsSync(file) ? readFileSync(file, "utf8") : "(no details were written)", "", `Commit \`${sha}\`. Run, traces and artifacts: ${run}`].join("\n");

const issue = { marker: key, title, labels: [label] };
(failed ? reportProblem(issue, body) : reportHealthy(issue, `Healthy again: ${run}`)).catch((error) => { console.error(error); process.exitCode = 1; });
