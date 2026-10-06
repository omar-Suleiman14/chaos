import { test, type Page } from "@playwright/test";
import { signInCreator, smokeEnvironment } from "../e2e/support";
import { schemes, snap, suite, useScheme } from "./support";

/**
 * App surfaces against the E2E environment (VISUAL_SUITE=app, never
 * production). Same fixtures as the perf journeys, plus E2E_VISUAL_FORMS: a
 * comma list of theme=shareId, one published form per major theme
 * (flow, chaos, paper, midnight, …), so each theme is checked in light and dark.
 */
test.skip(suite !== "app", "VISUAL_SUITE=site");

const fixtures = {
  formId: process.env.E2E_PERF_FORM_ID,
  courseId: process.env.E2E_PERF_COURSE_ID,
  lessonId: process.env.E2E_PERF_LESSON_ID,
};
const themed = (process.env.E2E_VISUAL_FORMS ?? "").split(",").map((pair) => pair.split("=").map((s) => s.trim())).filter(([theme, id]) => theme && id);

const usable = (page: Page, journey: string) => page.waitForFunction((name) => performance.getEntriesByName(`chaos:usable:${name}`).length > 0, journey, { timeout: 30_000 });

async function signedIn(page: Page) {
  const env = smokeEnvironment();
  await signInCreator(page, env.creatorEmail, env.creatorPassword);
}

for (const scheme of schemes) {
  test.describe(scheme, () => {
    test.beforeEach(async ({ page }) => { await useScheme(page, scheme); });

    test("dashboard", async ({ page }) => {
      await signedIn(page);
      await page.goto("/dashboard");
      await usable(page, "dashboard");
      await snap(page, `app-dashboard-${scheme}`, { maxDiffPixelRatio: 0.01 });
    });

    test("editor", async ({ page }) => {
      test.skip(!fixtures.formId, "E2E_PERF_FORM_ID not set");
      await signedIn(page);
      await page.goto(`/dashboard/forms/${fixtures.formId}`);
      await usable(page, "form.open");
      await snap(page, `app-editor-${scheme}`, { maxDiffPixelRatio: 0.01 });
    });

    test("lesson", async ({ page }) => {
      test.skip(!fixtures.lessonId, "E2E_PERF_LESSON_ID not set");
      await page.goto(`/learn/${fixtures.lessonId}`);
      await usable(page, "lesson.read");
      await snap(page, `app-lesson-${scheme}`);
    });

    test("course", async ({ page }) => {
      test.skip(!fixtures.courseId, "E2E_PERF_COURSE_ID not set");
      await page.goto(`/learn/courses/${fixtures.courseId}`);
      await usable(page, "course.modules");
      await snap(page, `app-course-${scheme}`);
    });

    test("author cards", async ({ page }) => {
      await page.goto("/card");
      await page.locator(".author-stack, .authors-state").first().waitFor();
      await snap(page, `app-card-${scheme}`, { maxDiffPixelRatio: 0.01 });
    });

    test("live join", async ({ page }) => {
      await page.goto("/play");
      await page.getByLabel(/nickname/i).waitFor();
      await snap(page, `app-live-join-${scheme}`);
    });

    for (const [theme, shareId] of themed) {
      test(`form theme ${theme}`, async ({ page }) => {
        await page.goto(`/f/${shareId}`);
        await page.locator(".form-theme").first().waitFor();
        await snap(page, `app-theme-${theme}-${scheme}`);
      });
    }
  });
}
