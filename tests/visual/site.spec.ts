import { test } from "@playwright/test";
import { isolate, open, schemes, snap, suite, useScheme } from "./support";

/**
 * Public pages from this branch's own build, with no backend: every pixel
 * comes from the code under review. Desktop and mobile (projects), light and
 * dark (below). App surfaces and form themes are in app.spec.ts.
 */
const pages = [
  { name: "home", path: "/", fullPage: true },
  { name: "pricing", path: "/pricing", fullPage: true },
  { name: "forms-quizzes", path: "/forms-quizzes" },
  { name: "live-games", path: "/live-games" },
  { name: "learn", path: "/learn" },
  { name: "teams", path: "/teams" },
  { name: "faq", path: "/faq" },
  { name: "docs", path: "/docs" },
];

test.skip(suite !== "site", "VISUAL_SUITE=app");

for (const p of pages) {
  for (const scheme of schemes) {
    test(`${p.name} ${scheme}`, async ({ page, baseURL }) => {
      await isolate(page, baseURL!);
      await useScheme(page, scheme);
      await open(page, p.path);
      await snap(page, `site-${p.name}-${scheme}`, { fullPage: p.fullPage });
    });
  }
}
