import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// Existing unused exports are tracked explicitly; additions fail CI and removals
// shrink the baseline. Dependencies, files and unresolved imports never get a pass.
const result = spawnSync("pnpm", ["exec", "knip", "--reporter", "json"], {
  encoding: "utf8",
});
if (result.error) throw result.error;
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(1);
}
const keys = [];
for (const issue of report.issues ?? []) {
  for (const [kind, values] of Object.entries(issue)) {
    if (["file", "owners"].includes(kind) || !Array.isArray(values)) continue;
    for (const value of values)
      keys.push(
        `${issue.file}:${kind}:${typeof value === "string" ? value : (value.name ?? JSON.stringify(value))}`,
      );
  }
}
for (const file of report.files ?? []) keys.push(`${file}:files`);
keys.sort();
const path = new URL("../knip-baseline.json", import.meta.url);
if (process.argv.includes("--update")) {
  const blocking = keys.filter((key) => !/:exports:|:types:/.test(key));
  if (blocking.length) {
    console.error(blocking.join("\n"));
    process.exit(1);
  }
  writeFileSync(path, `${JSON.stringify(keys, null, 2)}\n`);
} else {
  const baseline = new Set(JSON.parse(readFileSync(path, "utf8")));
  const additions = keys.filter((key) => !baseline.has(key));
  if (additions.length) {
    console.error(`New Knip findings:\n${additions.join("\n")}`);
    process.exit(1);
  }
  console.log(
    `Knip: no new findings (${keys.length} existing unused exports/types tracked).`,
  );
}
