import { percentChange } from "./stats";

export type JourneyStats = { journey: string; n: number; p50: number; p75: number; p95: number };
export type Thresholds = {
  minimumSamples: number;
  regression: { p75: number; p95: number; floorMs: number };
  journeys: Record<string, { p75: number; p95: number }>;
  errors: { ratio: number; minimum: number };
};
export type Problem = { journey: string; kind: "limit" | "regression" | "errors" | "status"; detail: string };

/**
 * Pure threshold policy: what in the last day breaks an absolute limit, or got
 * worse than the 7 days before it. Journeys with too few samples are skipped
 * on both sides, so a quiet night never raises an alarm.
 */
export function evaluateJourneys(current: JourneyStats[], baseline: JourneyStats[], t: Thresholds): Problem[] {
  const problems: Problem[] = [];
  const before = new Map(baseline.map((b) => [b.journey, b]));
  for (const now of current) {
    if (now.n < t.minimumSamples) continue;
    const limit = t.journeys[now.journey];
    for (const q of ["p75", "p95"] as const) {
      if (limit && now[q] > limit[q]) problems.push({ journey: now.journey, kind: "limit", detail: `${q} ${Math.round(now[q])} ms is over the ${limit[q]} ms limit (n=${now.n})` });
      const base = before.get(now.journey);
      if (!base || base.n < t.minimumSamples || base[q] <= 0) continue;
      if (now[q] > base[q] * (1 + t.regression[q]) && now[q] - base[q] >= t.regression.floorMs) {
        problems.push({ journey: now.journey, kind: "regression", detail: `${q} ${Math.round(base[q])} → ${Math.round(now[q])} ms (${percentChange(base[q], now[q])}) against the previous 7 days` });
      }
    }
  }
  return problems;
}

/** Errors in the last day against the daily average of the 7 days before. */
export function evaluateErrors(lastDay: number, previousWeek: number, t: Thresholds): Problem[] {
  const daily = previousWeek / 7;
  if (lastDay < t.errors.minimum || lastDay <= daily * t.errors.ratio) return [];
  return [{ journey: "errors", kind: "errors", detail: `${lastDay} errors in the last day, ${daily.toFixed(0)} per day before (${percentChange(daily, lastDay)})` }];
}

export type ServiceStatus = { service: string; observed: boolean; status: string; summary: string | null };
/** Services the platform's own status feed reports as degraded or down. */
export function evaluateStatus(services: ServiceStatus[]): Problem[] {
  return services.filter((s) => s.status === "degraded" || s.status === "outage")
    .map((s) => ({ journey: s.service, kind: "status" as const, detail: `${s.status}${s.summary ? `: ${s.summary}` : ""}` }));
}
