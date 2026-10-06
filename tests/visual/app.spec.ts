import { test, type Page } from "@playwright/test";
import { signInCreator } from "../e2e/support";
import { open, schemes, snap, suite, useScheme } from "./support";

/**
 * App surfaces (VISUAL_SUITE=app): this branch's build against the dev Convex
 * deployment, never production. E2E_VISUAL_FORMS is a comma list of
 * theme=shareId, one published form per major theme (flow, chaos, paper,
 * midnight, …), so each theme is checked in light and dark. Lesson, course and
 * editor use the perf fixtures; dashboard and editor need the test login.
 */
test.skip(suite !== "app", "VISUAL_SUITE=site");

const fixtures = {
  formId: process.env.E2E_PERF_FORM_ID,
  courseId: process.env.E2E_PERF_COURSE_ID,
  lessonId: process.env.E2E_PERF_LESSON_ID,
};
const themed = (process.env.E2E_VISUAL_FORMS ?? "").split(",").map((pair) => pair.split("=").map((s) => s.trim())).filter(([theme, id]) => theme && id);

const usable = (page: Page, journey: string) => page.waitForFunction((name) => performance.getEntriesByName(`chaos:usable:${name}`).length > 0, journey, { timeout: 30_000 });

const login = { email: process.env.E2E_CREATOR_EMAIL, password: process.env.E2E_CREATOR_PASSWORD };

async function signedIn(page: Page) {
  test.skip(!login.email || !login.password, "E2E_CREATOR_EMAIL / E2E_CREATOR_PASSWORD not set");
  await signInCreator(page, login.email!, login.password!);
}

for (const scheme of schemes) {
  test.describe(scheme, () => {
    test.beforeEach(async ({ page }) => { await useScheme(page, scheme); });

    test("dashboard", async ({ page }) => {
      await signedIn(page);
      await open(page, "/dashboard");
      await usable(page, "dashboard");
      await snap(page, `app-dashboard-${scheme}`, { maxDiffPixelRatio: 0.01 });
    });

    test("editor", async ({ page }) => {
      test.skip(!fixtures.formId, "E2E_PERF_FORM_ID not set");
      await signedIn(page);
      await open(page, `/dashboard/forms/${fixtures.formId}`);
      await usable(page, "form.open");
      await snap(page, `app-editor-${scheme}`, { maxDiffPixelRatio: 0.01 });
    });

    test("lesson", async ({ page }) => {
      test.skip(!fixtures.lessonId, "E2E_PERF_LESSON_ID not set");
      await open(page, `/learn/${fixtures.lessonId}`);
      await usable(page, "lesson.read");
      await snap(page, `app-lesson-${scheme}`);
    });

    test("course", async ({ page }) => {
      test.skip(!fixtures.courseId, "E2E_PERF_COURSE_ID not set");
      await open(page, `/learn/courses/${fixtures.courseId}`);
      await usable(page, "course.modules");
      await snap(page, `app-course-${scheme}`);
    });

    test("author cards", async ({ page }) => {
      await open(page, "/card");
      await page.locator(".author-stack, .authors-state").first().waitFor();
      await snap(page, `app-card-${scheme}`, { maxDiffPixelRatio: 0.01 });
    });

    test("live join", async ({ page }) => {
      await open(page, "/play");
      await page.getByLabel(/nickname/i).waitFor();
      await snap(page, `app-live-join-${scheme}`);
    });

    for (const [theme, shareId] of themed) {
      test(`form theme ${theme}`, async ({ page }) => {
        await open(page, `/f/${shareId}`);
        await page.locator(".form-theme").first().waitFor();
        await snap(page, `app-theme-${theme}-${scheme}`);
      });
    }
  });
}
