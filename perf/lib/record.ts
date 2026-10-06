import type { TestContext } from "vitest";

/**
 * One measured value. `count` and `bytes` metrics are deterministic and gate
 * pull requests; `ms` metrics are noisy and only gate scheduled runs with a
 * wide tolerance (see perf/README.md).
 */
export type PerfMetric = { value: number; unit: "count" | "bytes" | "ms" };

declare module "vitest" {
  interface TaskMeta { perf?: Record<string, PerfMetric> }
}

/** Attaches metrics to the running test; perf/lib/reporter.ts writes them to perf/results. */
export function recordPerf(ctx: Pick<TestContext, "task">, metrics: Record<string, PerfMetric | number>) {
  const into = (ctx.task.meta.perf ??= {});
  for (const [name, metric] of Object.entries(metrics)) {
    if (name in into) throw new Error(`Perf metric recorded twice: ${name}`);
    into[name] = typeof metric === "number" ? { value: metric, unit: "count" } : metric;
  }
}

export const bytes = (value: number): PerfMetric => ({ value, unit: "bytes" });
export const ms = (value: number): PerfMetric => ({ value: Math.round(value * 10) / 10, unit: "ms" });
/** Serialized size of a value as the Convex client would receive it. */
export const payloadBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value ?? null)).length;
