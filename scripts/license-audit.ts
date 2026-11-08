import { spawnSync } from "node:child_process";

/**
 * Runtime dependency license check (`pnpm licenses:check`). Every production dependency must use
 * a license known to be compatible with distributing Chaos under AGPL-3.0-or-later, or be listed
 * in REVIEWED with the reason a maintainer accepted it. A new license, or a reviewed package
 * changing license, fails the check. See docs/dependency-licenses.md.
 */

const ALLOWED = new Set(["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "Unlicense", "CC0-1.0", "MPL-2.0", "(MPL-2.0 OR Apache-2.0)", "(Apache-2.0 AND MIT)", "(MIT OR CC0-1.0)", "BlueOak-1.0.0", "Python-2.0", "Zlib"]);

/** package name → the license it was reviewed under and why it is accepted. */
const REVIEWED: Record<string, { license: string; reason: string }> = {
  khroma: { license: "Unknown", reason: "MIT per its LICENSE file; the package.json has no license field. Mermaid dependency." },
  elkjs: { license: "EPL-2.0", reason: "File-level copyleft, used unmodified as a separate module (Mermaid layout engine); source is public. Changes to elkjs itself would have to be published under EPL-2.0." },
  "caniuse-lite": { license: "CC-BY-4.0", reason: "Browser support data used by the build; attribution is kept in the package." },
};

const result = spawnSync("pnpm", ["licenses", "list", "--prod", "--json"], { encoding: "utf8" });
if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout); process.exit(1); }
const byLicense = JSON.parse(result.stdout) as Record<string, { name: string; versions: string[] }[]>;

const problems: string[] = [];
let count = 0;
for (const [license, packages] of Object.entries(byLicense)) {
  for (const pkg of packages) {
    count++;
    const reviewed = REVIEWED[pkg.name];
    if (reviewed) {
      if (reviewed.license !== license) problems.push(`${pkg.name}@${pkg.versions.join(",")}: license changed from reviewed ${reviewed.license} to ${license}.`);
      continue;
    }
    if (!ALLOWED.has(license)) problems.push(`${pkg.name}@${pkg.versions.join(",")}: ${license} is not on the allowed list. Review it and add it to scripts/license-audit.ts.`);
  }
}
if (problems.length) {
  console.error(`License check failed (${problems.length}):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`License check passed: ${count} runtime packages, ${Object.keys(REVIEWED).length} reviewed exceptions.`);
