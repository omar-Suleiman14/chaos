/**
 * Real-browser timings for the public Learn, course, lesson and docs pages of a deployed Chaos.
 *
 *   pnpm tsx scripts/perf-learn-live.ts https://chaos.fail [runs] > perf/results/learn-live.json
 *
 * Each run is a cold visit in a fresh browser context (no cache, no cookies). Reported per page,
 * as the median of the runs: time to first byte, first contentful paint, when the page was ready
 * (no busy placeholder left and the page's own content on screen), how long a skeleton or loading
 * text was visible, HTTP requests and bytes, Convex queries subscribed and redirects followed.
 * A second pass measures in-app navigations: hover, click, and the time until the next page is ready.
 */
import { chromium, type Page } from "@playwright/test";

const base = (process.argv[2] ?? "https://chaos.fail").replace(/\/+$/, "");
const runs = Number(process.argv[3] ?? 3);
const learn = base.replace("://", "://learn.");
const docs = base.replace("://", "://docs.");

const COURSE = "s978wryyhv41eb9nhv0dqgm0vh8fgh9d";
/** A lesson inside COURSE (signed-out visitors see the course's Start step) and one on its own. */
const COURSE_LESSON = "xd70venrj6rpd344ka0aznc54x8fg0jn";
const LESSON = "xd7c69yw05spks8bvppvb99ks58fnxjs";

const pages: { name: string; url: string; ready: string }[] = [
  { name: "explore", url: `${base}/learn`, ready: "a[href*='/learn/courses/']" },
  { name: "course", url: `${learn}/learn/courses/${COURSE}`, ready: ".cp-main" },
  { name: "lesson", url: `${learn}/learn/${LESSON}`, ready: "#lesson-title" },
  { name: "course lesson, plain link", url: `${learn}/learn/${COURSE_LESSON}`, ready: "#lesson-title" },
  { name: "course lesson, course link", url: `${learn}/learn/${COURSE_LESSON}?course=${COURSE}`, ready: "#lesson-title" },
  { name: "docs", url: `${docs}/`, ready: "main h1" },
];

const median = (values: number[]) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/** Watches for placeholders from the first paint on; reports when the page settled. */
const probe = (ready: string) => `(() => {
  const w = window; w.__perf = { busyMs: 0, readyAt: null };
  let busySince = null;
  const busy = () => !!document.querySelector('[aria-busy="true"], .ws-skeleton, [role="status"]:not(:empty)');
  const tick = () => {
    const now = performance.now();
    const b = busy();
    if (b && busySince === null) busySince = now;
    if (!b && busySince !== null) { w.__perf.busyMs += now - busySince; busySince = null; }
    if (!b && w.__perf.readyAt === null && document.querySelector(${JSON.stringify(ready)})) w.__perf.readyAt = now;
    if (w.__perf.readyAt === null || now < 15000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

async function convexCounter(page: Page) {
  let queries = 0;
  page.on("websocket", (ws) => ws.on("framesent", ({ payload }) => {
    try {
      const msg = JSON.parse(String(payload)) as { type?: string; modifications?: { type: string }[] };
      if (msg.type === "ModifyQuerySet") queries += (msg.modifications ?? []).filter((m) => m.type === "Add").length;
    } catch { /* binary or non-JSON frame */ }
  }));
  return () => queries;
}

async function cold(url: string, ready: string) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript(probe(ready));
  const queries = await convexCounter(page);
  let requests = 0, bytes = 0;
  // Server redirects and client-side URL replacements both cost the visitor a round trip or a re-render.
  const urls = new Set<string>();
  page.on("requestfinished", async (request) => {
    requests++;
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) urls.add(request.url());
    try { bytes += (await request.sizes()).responseBodySize; } catch { /* gone */ }
  });
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) urls.add(frame.url()); });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => (window as unknown as { __perf: { readyAt: number | null } }).__perf.readyAt !== null, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    const perf = (window as unknown as { __perf: { busyMs: number; readyAt: number | null } }).__perf;
    return { ttfb: nav.responseStart, fcp, ready: perf.readyAt, busyMs: perf.busyMs };
  });
  const result = { ...timing, requests, kb: Math.round(bytes / 1024), convexQueries: queries(), navigations: urls.size - 1 };
  await browser.close();
  return result;
}

/** Hover a link for 300 ms (intent), click it, and time until the next page is ready. */
async function inApp(from: string, link: string, ready: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(from, { waitUntil: "load" });
  await page.waitForSelector(link, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.hover(link);
  await page.waitForTimeout(300);
  const start = Date.now();
  await page.click(link);
  await page.waitForFunction((sel) => !document.querySelector('[aria-busy="true"], .ws-skeleton') && !!document.querySelector(sel) && location.pathname.includes("/courses/"), ready, { timeout: 15000 }).catch(() => {});
  const ms = Date.now() - start;
  await browser.close();
  return ms;
}

async function main() {
  const out: Record<string, Record<string, number | null>> = {};
  for (const p of pages) {
    const samples: Awaited<ReturnType<typeof cold>>[] = [];
    for (let i = 0; i < runs; i++) samples.push(await cold(p.url, p.ready));
    const pick = (k: keyof (typeof samples)[number]) => { const v = samples.map((s) => s[k]).filter((x): x is number => typeof x === "number"); return v.length ? Math.round(median(v)) : null; };
    out[p.name] = { ttfbMs: pick("ttfb"), fcpMs: pick("fcp"), readyMs: pick("ready"), placeholderMs: pick("busyMs"), requests: pick("requests"), kb: pick("kb"), convexQueries: pick("convexQueries"), extraNavigations: pick("navigations") };
    console.error(p.name, out[p.name]);
  }
  const clicks: number[] = [];
  for (let i = 0; i < runs; i++) clicks.push(await inApp(`${learn}/learn`, "a[href*='/learn/courses/']", ".cp-main"));
  out["explore → course click"] = { readyMs: median(clicks) };
  console.error("explore → course click", out["explore → course click"]);
  console.log(JSON.stringify({ base, runs, at: new Date().toISOString(), pages: out }, null, 2));
}

void main();
