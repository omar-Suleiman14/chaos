import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { signInCreator, smokeEnvironment } from "../../tests/e2e/support";

/**
 * Browser timings for the journeys in lib/journeys.ts, against a deployed,
 * non-production E2E environment. The app marks each journey usable itself;
 * this reads the mark, so lab numbers equal what real users report.
 *
 * Content journeys need fixture ids from the seeded workspace (step "Preview
 * environment" in perf/README.md); a journey without its fixture is skipped,
 * never faked.
 */
const RUNS = Number(process.env.PERF_RUNS ?? 5);
const fixtures = {
  formId: process.env.E2E_PERF_FORM_ID,
  courseId: process.env.E2E_PERF_COURSE_ID,
  lessonId: process.env.E2E_PERF_LESSON_ID,
  quizShareId: process.env.E2E_PERF_QUIZ_SHARE_ID,
  livePin: process.env.E2E_PERF_LIVE_PIN,
};
const samples: Record<string, number[]> = {};

test.describe.configure({ mode: "serial" });
let page: Page;

test.beforeAll(async ({ browser }) => {
  const env = smokeEnvironment();
  page = await browser.newPage();
  await signInCreator(page, env.creatorEmail, env.creatorPassword);
});

test.afterAll(async () => {
  const metrics: Record<string, { value: number; unit: "ms" }> = {};
  for (const [journey, values] of Object.entries(samples)) {
    const sorted = [...values].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    metrics[`browser.${journey}.p50`] = { value: at(0.5), unit: "ms" };
    metrics[`browser.${journey}.p75`] = { value: at(0.75), unit: "ms" };
    metrics[`browser.${journey}.p95`] = { value: at(0.95), unit: "ms" };
  }
  mkdirSync(join("perf", "results"), { recursive: true });
  writeFileSync(join("perf", "results", "journeys-browser.json"), JSON.stringify({ suite: "journeys-browser", failed: [], metrics }, null, 2) + "\n");
  await page?.close();
});

/** Waits for the app's usable mark and returns its duration (lib/journeys.ts). */
async function usable(target: Page, journey: string, timeout = 30_000) {
  const handle = await target.waitForFunction((name) => {
    const entry = performance.getEntriesByName(`chaos:usable:${name}`).at(-1) as PerformanceMark | undefined;
    return entry ? (entry.detail as { ms: number }).ms : null;
  }, journey, { timeout });
  const ms = (await handle.jsonValue()) as number;
  (samples[journey] ??= []).push(ms);
  return ms;
}

test("dashboard → usable", async () => {
  for (let i = 0; i < RUNS; i++) {
    await page.goto("/dashboard", { waitUntil: "commit" });
    await usable(page, "dashboard");
  }
});

test("create form → first question editable", async () => {
  for (let i = 0; i < RUNS; i++) {
    await page.goto("/dashboard?tab=forms");
    await usable(page, "dashboard");
    await page.getByRole("button", { name: /^New$|Create something new/ }).first().click();
    await page.getByRole("menuitem", { name: /^Form/ }).click();
    await usable(page, "form.create");
    await expect(page.locator("input, textarea, [contenteditable=true]").first()).toBeEditable();
  }
});

test("existing form → editable", async () => {
  test.skip(!fixtures.formId, "E2E_PERF_FORM_ID not set");
  for (let i = 0; i < RUNS; i++) {
    await page.goto(`/dashboard/forms/${fixtures.formId}`, { waitUntil: "commit" });
    await usable(page, "form.open");
  }
});

test("course → module list usable", async () => {
  test.skip(!fixtures.courseId, "E2E_PERF_COURSE_ID not set");
  for (let i = 0; i < RUNS; i++) {
    await page.goto(`/learn/courses/${fixtures.courseId}`, { waitUntil: "commit" });
    await usable(page, "course.modules");
  }
});

test("lesson → readable and interactive", async () => {
  test.skip(!fixtures.lessonId, "E2E_PERF_LESSON_ID not set");
  for (let i = 0; i < RUNS; i++) {
    await page.goto(`/learn/${fixtures.lessonId}`, { waitUntil: "commit" });
    await usable(page, "lesson.read");
  }
});

test("quiz → question usable", async ({ browser }) => {
  test.skip(!fixtures.quizShareId, "E2E_PERF_QUIZ_SHARE_ID not set");
  // A respondent is anonymous: a fresh context, no creator session.
  const respondent = await (await browser.newContext()).newPage();
  for (let i = 0; i < RUNS; i++) {
    await respondent.goto(`/f/${fixtures.quizShareId}`, { waitUntil: "commit" });
    const start = respondent.getByRole("button", { name: /^Start/ });
    if (await start.isVisible({ timeout: 10_000 }).catch(() => false)) await start.click();
    await usable(respondent, "quiz.question");
  }
  await respondent.close();
});

test("live game → joined", async ({ browser }) => {
  test.skip(!fixtures.livePin, "E2E_PERF_LIVE_PIN not set");
  for (let i = 0; i < RUNS; i++) {
    const player = await (await browser.newContext()).newPage();
    await player.goto(`/play?pin=${fixtures.livePin}`);
    await player.getByLabel(/nickname/i).fill(`perf-${Date.now().toString(36)}`);
    await player.getByRole("button", { name: /^Join/ }).click();
    await usable(player, "live.join");
    await player.close();
  }
});
