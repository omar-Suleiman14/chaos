import { expect, test } from "@playwright/test";
import { signInCreator, smokeEnvironment } from "../../tests/e2e/support";
import { browserSuite, chromeWork } from "./results";

/**
 * The forms editor keystroke budget in a real browser: keydown → next paint
 * (Event Timing, the same measure as INP), plus style recalculations, layouts
 * and script time per keystroke. Uses a large form from the seeded E2E
 * workspace (E2E_PERF_LARGE_FORM_ID, 100 questions). The jsdom half of this
 * benchmark (React commits, DOM work, store writes, Convex calls) is
 * perf/client/builderKeystroke.perf.test.tsx and gates every PR.
 */
const formId = process.env.E2E_PERF_LARGE_FORM_ID;
const KEYS = 30;
const suite = browserSuite("keystroke-browser");
test.afterAll(() => suite.write());

test("keystrokes in a 100-question form", async ({ page }) => {
  test.skip(!formId, "E2E_PERF_LARGE_FORM_ID not set");
  const env = smokeEnvironment();
  await signInCreator(page, env.creatorEmail, env.creatorPassword);
  await page.goto(`/dashboard/forms/${formId}`);
  await page.waitForFunction(() => performance.getEntriesByName("chaos:usable:form.open").length > 0);
  const label = page.locator("input.kb-input").first();
  await label.click();
  await label.press("End");

  // Event Timing reports keyboard interactions with their full keydown → paint duration.
  await page.evaluate(() => {
    const w = window as unknown as { __keys: number[] };
    w.__keys = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceEventTiming[]) if (e.name === "keydown") w.__keys.push(e.duration);
    }).observe({ type: "event", buffered: false, durationThreshold: 16 } as PerformanceObserverInit);
  });
  const work = await chromeWork(page, async () => {
    for (let i = 0; i < KEYS; i++) await page.keyboard.type("x", { delay: 40 });
    await page.waitForTimeout(300);
  });
  const durations = await page.evaluate(() => (window as unknown as { __keys: number[] }).__keys);
  // Interactions under 16 ms are not reported; count them at the threshold so fast runs are not dropped.
  for (let i = 0; i < KEYS; i++) suite.add("keystroke.q100.keydownToPaint", durations[i] ?? 16);
  suite.add("keystroke.q100.recalcStylesPerKey", Math.round(work.recalcStyles / KEYS), "count");
  suite.add("keystroke.q100.layoutsPerKey", Math.round(work.layouts / KEYS), "count");
  suite.add("keystroke.q100.styleMsPerKey", work.recalcStyleMs / KEYS);
  suite.add("keystroke.q100.scriptMsPerKey", work.scriptMs / KEYS);
  await expect(label).toHaveValue(/x{30}$/);
  // Leave the fixture as it was: undo the typing.
  for (let i = 0; i < KEYS; i++) await label.press("Backspace");
});
