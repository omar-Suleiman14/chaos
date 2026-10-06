/** Nearest-rank percentile of samples (p in 0..100); NaN when there are none. */
export function percentile(samples: number[], p: number): number {
  if (!samples.length) return NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/** p50/p75/p95 rounded to 0.1 ms. */
export function quantiles(samples: number[]) {
  const round = (n: number) => Math.round(n * 10) / 10;
  return { p50: round(percentile(samples, 50)), p75: round(percentile(samples, 75)), p95: round(percentile(samples, 95)) };
}

export type Change = { metric: string; before: number; after: number; ratio: number };

/**
 * Metrics that got worse by more than `threshold` (0.5 = 50% slower) and by at
 * least `floor` in absolute terms, so a 3 ms → 5 ms blip is not a regression.
 */
export function regressions(before: Record<string, number>, after: Record<string, number>, threshold: number, floor = 0): Change[] {
  const out: Change[] = [];
  for (const [metric, value] of Object.entries(after)) {
    const base = before[metric];
    if (base === undefined || !Number.isFinite(base) || !Number.isFinite(value) || base <= 0) continue;
    if (value > base * (1 + threshold) && value - base >= floor) out.push({ metric, before: base, after: value, ratio: value / base });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

/** "+18%" / "−22%" relative to a base value. */
export function percentChange(before: number, after: number): string {
  if (!before) return "";
  const change = (after / before - 1) * 100;
  return `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(0)}%`;
}
