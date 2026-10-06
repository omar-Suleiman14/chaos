import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

type Unit = "ms" | "count";

/** Collects samples per metric and writes perf/results/<suite>.json in the ratchet's format. */
export function browserSuite(suite: string) {
  const samples: Record<string, { unit: Unit; values: number[] }> = {};
  return {
    add(name: string, value: number, unit: Unit = "ms") { (samples[name] ??= { unit, values: [] }).values.push(value); },
    write() {
      const metrics: Record<string, { value: number; unit: Unit }> = {};
      for (const [name, { unit, values }] of Object.entries(samples)) {
        const sorted = [...values].sort((a, b) => a - b);
        const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
        if (unit === "count") metrics[name] = { value: at(0.5), unit };
        else for (const [label, q] of [["p50", 0.5], ["p75", 0.75], ["p95", 0.95]] as const) metrics[`${name}.${label}`] = { value: Math.round(at(q) * 10) / 10, unit };
      }
      mkdirSync(join("perf", "results"), { recursive: true });
      writeFileSync(join("perf", "results", `${suite}.json`), JSON.stringify({ suite, failed: [], metrics }, null, 2) + "\n");
    },
  };
}

/** Chromium's own counters (style recalculations, layouts, script time) around `fn`. */
export async function chromeWork(page: Page, fn: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const read = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const before = await read();
  await fn();
  const after = await read();
  await cdp.detach();
  const delta = (k: string) => (after[k] ?? 0) - (before[k] ?? 0);
  return {
    recalcStyles: delta("RecalcStyleCount"), recalcStyleMs: delta("RecalcStyleDuration") * 1000,
    layouts: delta("LayoutCount"), layoutMs: delta("LayoutDuration") * 1000, scriptMs: delta("ScriptDuration") * 1000,
  };
}
