// Flag expiry policy for lib/flags.ts.
//
//   pnpm flags:check          fail on expired or malformed flags, warn on flags expiring within 14 days
//   pnpm flags:check -- --ci  pull requests: fail only on malformed flags; expiry becomes an annotation
//
// The weekly workflow (.github/workflows/flags.yml) turns findings into one issue,
// so temporary ramps get removed instead of turning into permanent flag debt.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditFlags, FLAGS } from "../lib/flags";

const ci = process.argv.includes("--ci");
const findings = auditFlags(FLAGS, new Date());

/** Source files that read a flag; a flag nobody reads is either new or ready to delete. */
function usages(): Map<string, string[]> {
  const found = new Map<string, string[]>(Object.keys(FLAGS).map((k) => [k, []]));
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".") || name === "_generated") continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!/\.(ts|tsx)$/.test(name) || path === join("lib", "flags.ts") || path.startsWith("tests")) continue;
      const text = readFileSync(path, "utf8");
      for (const key of found.keys()) if (text.includes(`"${key}"`)) found.get(key)!.push(path);
    }
  };
  for (const dir of ["app", "components", "lib", "convex"]) walk(dir);
  return found;
}

const used = usages();
const lines = ["## Feature flags", "", "| Flag | Kind | Owner | Expires | Read in |", "|---|---|---|---|---|"];
for (const [key, flag] of Object.entries(FLAGS)) {
  const where = used.get(key) ?? [];
  lines.push(`| \`${key}\` | ${flag.kind} | ${flag.owner} | ${"expiresAt" in flag ? flag.expiresAt : "—"} | ${where.length ? where.map((p) => `\`${p}\``).join(", ") : "not read yet"} |`);
}
if (findings.length) lines.push("", ...findings.map((f) => `- ${f.level === "error" ? "🔴" : "🟡"} \`${f.key}\`: ${f.message}`));
else lines.push("", "No flag is expired or expiring within 14 days.");
lines.push("", "Remove a finished ramp: keep the winning code path, delete the flag from `lib/flags.ts` and its `useFlag`/`flagEnabled` calls. Its rollout row is swept automatically.");

mkdirSync(join("perf", "results"), { recursive: true });
writeFileSync(join("perf", "results", "flags.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));

const expired = (message: string) => /^expired /.test(message);
for (const f of findings) {
  if (ci && (f.level === "warning" || expired(f.message))) console.log(`::warning title=Feature flag ${f.key}::${f.message}`);
}
const failing = findings.filter((f) => f.level === "error" && !(ci && expired(f.message)));
const warnings = findings.filter((f) => f.level === "warning");
// Outside CI, an approaching expiry also counts, so the weekly issue opens before the deadline.
process.exitCode = failing.length || (!ci && warnings.length) ? 1 : 0;
