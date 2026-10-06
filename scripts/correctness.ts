// Correctness before speed: the suites a performance number is worthless without.
// Runs them and writes perf/results/correctness.json in the budget format, so
// `pnpm perf:check` reports a failure here as a failure of the perf run
// (perf/README.md, "Correctness before speed").
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SUITES: { name: string; config: string; files: string[] }[] = [
  {
    name: "integration",
    config: "vitest.integration.config.mts",
    // Lost answers, exposed drafts, stale or deleted content, publication and answer-key boundaries.
    files: ["correctnessGates", "reactivity", "formIntegrity", "coursePublicationBoundaries", "releaseBoundaries", "answerSecrecy"],
  },
  {
    name: "client",
    config: "vitest.unit.config.mts",
    // The device cache never shows another account's or deleted data; editor drafts survive.
    files: ["confirmedQuery", "editorDraftRecovery", "formDraftAsync"],
  },
];

const failed: string[] = [];
for (const suite of SUITES) {
  const { status } = spawnSync("pnpm", ["exec", "vitest", "run", "--config", suite.config, ...suite.files], { stdio: "inherit", shell: process.platform === "win32" });
  if (status !== 0) failed.push(`correctness/${suite.name}`);
}
mkdirSync(join("perf", "results"), { recursive: true });
writeFileSync(join("perf", "results", "correctness.json"), JSON.stringify({ suite: "correctness", failed, metrics: {} }, null, 2) + "\n");
console.log(failed.length ? `correctness: ${failed.join(", ")} failed` : "correctness: all checks passed");
process.exitCode = failed.length ? 1 : 0;
