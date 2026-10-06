/**
 * Keeps the performance harness honest. An optimisation is measured by the
 * harness, so the same change must not also rewrite the harness or quietly
 * loosen a budget. Pure functions so the policy is unit tested
 * (scripts/perf-guard.ts runs them on a pull request's diff).
 */

/** Files that define what is measured and how it is judged. */
const HARNESS = [
  /^perf\/(lib|backend|client|browser)\//,
  /^perf\/production-thresholds\.json$/,
  /^scripts\/perf-[^/]+\.ts$/,
  /^scripts\/(perf-guard|mcp-synthetic|production-health)\.ts$/,
  /^scripts\/lib\/(perfGuard|stats|health)\.ts$/,
  /^(vitest\.perf\.config\.mts|playwright\.perf\.config\.ts)$/,
  /^\.github\/workflows\/(perf|perf-nightly|perf-journeys|mcp-synthetic|production-health)\.yml$/,
];
/** Product code an optimisation would change. */
const PRODUCT = [/^(app|components|lib|convex|hooks|proxy\.ts|next\.config\.ts)/];
const IGNORED = [/^convex\/_generated\//, /\.md$/];

export function classify(paths: string[]) {
  const harness = paths.filter((p) => HARNESS.some((r) => r.test(p)));
  const product = paths.filter((p) => !harness.includes(p) && !IGNORED.some((r) => r.test(p)) && PRODUCT.some((r) => r.test(p)));
  return { harness, product };
}

type Budget = { budget: number; unit: string; raised?: { from: number; reason: string; at: string } };
type Baseline = { suite: string; tolerance?: Record<string, number>; metrics: Record<string, Budget> };

/**
 * Budget changes between the base branch and the pull request. Lowering is
 * always fine (pnpm perf:ratchet). Raising must go through `perf-ratchet raise`,
 * which records where it came from and why. Removing a budget, or widening a
 * suite's tolerance, is never quiet.
 */
export function baselineProblems(base: Baseline | null, head: Baseline | null, suite: string): string[] {
  const problems: string[] = [];
  if (!base) return problems;
  if (!head) return [`${suite}: the whole baseline file was deleted`];
  for (const [unit, tolerance] of Object.entries(head.tolerance ?? {})) {
    const before = base.tolerance?.[unit];
    if (before === undefined || tolerance > before) problems.push(`${suite}: ${unit} tolerance widened from ${before ?? "the default"} to ${tolerance}`);
  }
  for (const [metric, b] of Object.entries(base.metrics)) {
    const h = head.metrics[metric];
    if (!h) { problems.push(`${suite}: budget ${metric} was removed`); continue; }
    if (h.budget <= b.budget) continue;
    const explained = h.raised && h.raised.from === b.budget && h.raised.reason.trim().length >= 15;
    if (!explained) problems.push(`${suite}: ${metric} raised ${b.budget} → ${h.budget} without perf-ratchet raise and a reason`);
  }
  return problems;
}

export const HARNESS_LABEL = "perf-harness-change";

/** The verdict for one pull request. */
export function guard(paths: string[], labels: string[], baselineIssues: string[]) {
  const { harness, product } = classify(paths);
  const problems = [...baselineIssues];
  if (harness.length && product.length && !labels.includes(HARNESS_LABEL)) {
    problems.push(
      `This change edits both product code and the performance harness (${harness.join(", ")}). ` +
      `Split the harness change into its own pull request, or add the ${HARNESS_LABEL} label after review.`,
    );
  }
  return { harness, product, problems };
}
