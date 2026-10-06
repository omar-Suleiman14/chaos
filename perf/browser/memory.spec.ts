import { expect, test, type Page } from "@playwright/test";
import { signInCreator, smokeEnvironment } from "../../tests/e2e/support";
import { browserSuite, memory } from "./results";
import { instrument } from "./instrument";

/**
 * Memory across repeated open/close: the dashboard opens a large lesson or
 * form editor and goes back, CYCLES times, in one page (client-side
 * navigation, as people do). After each return and a forced garbage
 * collection, the JS heap, DOM nodes, window/document listeners and live
 * Convex subscriptions must come back to where they started. Growth per cycle
 * means an editor leaks: subscriptions, listeners, timers or detached DOM.
 *
 * Against the E2E environment only (tests/e2e/support.ts refuses production).
 */
const CYCLES = Number(process.env.PERF_MEMORY_CYCLES ?? 6);
const suite = browserSuite("memory-browser");
/** Heap growth allowed per cycle after warm-up (caches, code loaded once). */
const MAX_HEAP_GROWTH_PER_CYCLE = 1.5 * 1024 * 1024;

test.describe.configure({ mode: "serial" });
test.afterAll(() => suite.write());
test.skip(!process.env.E2E_CREATOR_EMAIL, "E2E_CREATOR_EMAIL not set");

/** window + document listeners, through the DevTools command line API. */
async function listeners(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const { result } = await cdp.send("Runtime.evaluate", {
    expression: "(() => { const count = (t) => Object.values(getEventListeners(t)).reduce((n, l) => n + l.length, 0); return count(window) + count(document); })()",
    includeCommandLineAPI: true,
    returnByValue: true,
  });
  await cdp.detach();
  return Number(result.value ?? 0);
}

/** Client-side navigation through the app router, so the page (and any leak) survives. */
async function navigate(page: Page, url: string) {
  await page.evaluate((to) => {
    const router = (window as unknown as { next?: { router?: { push(href: string): void } } }).next?.router;
    if (router) router.push(to); else location.assign(to);
  }, url);
}

const usable = (page: Page, journey: string, after: number) => page.waitForFunction(
  ([name, since]) => performance.getEntriesByName(`chaos:usable:${name}`).some((e) => e.startTime > (since as number)),
  [journey, after] as const, { timeout: 30_000 },
);
const now = (page: Page) => page.evaluate(() => performance.now());

const targets = [
  { name: "giantLesson", id: process.env.E2E_PERF_GIANT_LESSON_ID ?? process.env.E2E_PERF_LESSON_ID, url: (id: string) => `/dashboard/learn/lessons/${id}`, journey: "lesson.edit" },
  { name: "largeForm", id: process.env.E2E_PERF_LARGE_FORM_ID ?? process.env.E2E_PERF_FORM_ID, url: (id: string) => `/dashboard/forms/${id}`, journey: "form.open" },
];

for (const target of targets) {
  test(`${target.name} editor releases memory when closed`, async ({ page }) => {
    test.skip(!target.id, `no fixture for ${target.name}`);
    test.setTimeout(60_000 + CYCLES * 30_000);
    const env = smokeEnvironment();
    const probe = await instrument(page);
    await signInCreator(page, env.creatorEmail, env.creatorPassword);
    await page.goto("/dashboard");
    await usable(page, "dashboard", -1);

    const samples: { heap: number; dom: number; listeners: number; subscriptions: number }[] = [];
    for (let cycle = 0; cycle <= CYCLES; cycle++) {
      if (cycle > 0) {
        const opened = await now(page);
        await navigate(page, target.url(target.id!));
        await usable(page, target.journey, opened);
        await page.waitForTimeout(1000);
        await page.goBack();
        await page.waitForURL(/\/dashboard\/?$/);
        await page.waitForTimeout(1500);
      }
      const mem = await memory(page);
      samples.push({ heap: mem.heapBytes, dom: mem.domNodes, listeners: await listeners(page), subscriptions: probe.subscriptions().length });
    }

    // Cycle 1 loads the editor's code and warms caches; leaks show as growth after it.
    const warm = samples[1], last = samples.at(-1)!;
    const perCycle = (last.heap - warm.heap) / (CYCLES - 1);
    const m = `memory.${target.name}`;
    suite.add(`${m}.heapGrowthPerCycle`, Math.max(0, Math.round(perCycle)), "bytes");
    suite.add(`${m}.domNodeGrowth`, Math.max(0, last.dom - warm.dom), "count");
    suite.add(`${m}.listenerGrowth`, Math.max(0, last.listeners - warm.listeners), "count");
    suite.add(`${m}.subscriptionGrowth`, Math.max(0, last.subscriptions - samples[0].subscriptions), "count");
    test.info().annotations.push({ type: `${target.name} samples`, description: JSON.stringify(samples) });

    expect(last.subscriptions, "Convex subscriptions left behind by closed editors").toBeLessThanOrEqual(samples[0].subscriptions);
    expect(last.listeners - warm.listeners, "window/document listeners left behind by closed editors").toBeLessThanOrEqual(2);
    expect(perCycle, `heap grows ${Math.round(perCycle / 1024)} KiB per open/close`).toBeLessThanOrEqual(MAX_HEAP_GROWTH_PER_CYCLE);
  });
}
