import type { Page } from "@playwright/test";
import { installFiberCensus, summarize, type Census } from "../lib/fiberCensus";

/**
 * In-page probes for perf/browser/render.spec.ts, installed before any app
 * script runs:
 * - the React render census (perf/lib/fiberCensus.ts);
 * - layout shifts, with the elements that moved;
 * - a frame sampler: per animation frame, the main-thread time from the start
 *   of requestAnimationFrame to the end of that frame's style, layout and paint
 *   (a message posted from rAF runs after them). Compositor-only animations
 *   (transform, opacity) cost almost nothing here; layout-driven ones show up.
 * - Convex subscriptions, from the client's own ModifyQuerySet messages.
 */
function installProbes() {
  type Shift = { value: number; sources: string[] };
  const w = window as unknown as { __chaosShifts: Shift[]; __chaosFrames: { start(): void; stop(): { work: number[]; gaps: number[] } } };
  const describe = (node: Node | null) => {
    if (!node || node.nodeType !== 1) return "#text";
    const el = node as Element;
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join("") : "";
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls}`;
  };
  w.__chaosShifts = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node: Node | null }[] })[]) {
        if (!e.hadRecentInput) w.__chaosShifts.push({ value: e.value, sources: (e.sources ?? []).map((s) => describe(s.node)) });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch { /* not supported */ }
  let running = false, last = 0;
  let work: number[] = [], gaps: number[] = [];
  const frame = (ts: number) => {
    if (!running) return;
    const start = performance.now();
    if (last) gaps.push(ts - last);
    last = ts;
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { work.push(performance.now() - start); };
    channel.port2.postMessage(0);
    requestAnimationFrame(frame);
  };
  w.__chaosFrames = {
    start() { running = true; last = 0; work = []; gaps = []; requestAnimationFrame(frame); },
    stop() { running = false; return { work, gaps }; },
  };
}

export type Probe = Awaited<ReturnType<typeof instrument>>;

export async function instrument(page: Page) {
  await page.addInitScript(installFiberCensus);
  await page.addInitScript(installProbes);
  const queries = new Map<number, string>();
  page.on("websocket", (ws) => {
    if (!/convex/.test(ws.url())) return;
    ws.on("framesent", ({ payload }) => {
      if (typeof payload !== "string" || !payload.includes("ModifyQuerySet")) return;
      try {
        const message = JSON.parse(payload) as { type: string; modifications: { type: "Add" | "Remove"; queryId: number; udfPath?: string }[] };
        for (const m of message.modifications) if (m.type === "Add") queries.set(m.queryId, m.udfPath ?? "?"); else queries.delete(m.queryId);
      } catch { /* not JSON */ }
    });
    ws.on("close", () => queries.clear());
  });
  return {
    /** Live Convex subscriptions right now, by function. */
    subscriptions() { return [...queries.values()]; },
    async commitMark() { return page.evaluate(() => (window as unknown as { __chaosCensus?: Census }).__chaosCensus?.commits.length ?? 0); },
    async renders(since: number) {
      const commits = await page.evaluate((at) => (window as unknown as { __chaosCensus?: Census }).__chaosCensus?.since(at) ?? [], since);
      return summarize(commits);
    },
    /** Census sanity: false when React never registered (a real DevTools hook, or no React). */
    async censusActive() { return page.evaluate(() => !!(window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: { renderers?: Map<number, unknown> } }).__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.size); },
    async layoutShift() {
      const shifts = await page.evaluate(() => (window as unknown as { __chaosShifts: { value: number; sources: string[] }[] }).__chaosShifts);
      const cls = shifts.reduce((n, s) => n + s.value, 0);
      const movers = new Map<string, number>();
      for (const s of shifts) for (const src of s.sources) movers.set(src, (movers.get(src) ?? 0) + s.value);
      return { cls, shifts: shifts.length, movers: [...movers].sort((a, b) => b[1] - a[1]).slice(0, 5) };
    },
    /** Samples frames while `fn` runs, then for `settleMs` more. */
    async frames(fn: () => Promise<void>, settleMs = 800) {
      await page.evaluate(() => (window as unknown as { __chaosFrames: { start(): void } }).__chaosFrames.start());
      await fn();
      await page.waitForTimeout(settleMs);
      const { work, gaps } = await page.evaluate(() => (window as unknown as { __chaosFrames: { stop(): { work: number[]; gaps: number[] } } }).__chaosFrames.stop());
      const sorted = [...work].sort((a, b) => a - b);
      return {
        frames: work.length,
        p95WorkMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
        // Main-thread work that would miss a 60 Hz (16.7 ms) or 120 Hz (8.3 ms) frame.
        over60: work.filter((ms) => ms > 1000 / 60).length,
        over120: work.filter((ms) => ms > 1000 / 120).length,
        // Frames the display actually skipped at the emulated refresh rate.
        dropped: gaps.filter((ms) => ms > 1.5 * (1000 / 60)).length,
      };
    },
  };
}
