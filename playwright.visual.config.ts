import { defineConfig, devices } from "@playwright/test";

// Visual regression (tests/visual, .github/workflows/visual.yml). Baselines are
// not committed: CI records them on main and pull requests compare against the
// latest main run, so every screenshot comes from the same Linux renderer.
// The site suite starts `pnpm start` on a build; the app suite runs against the
// E2E environment when PLAYWRIGHT_BASE_URL is set.
const external = !!process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: "./tests/visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report/visual" }]],
  expect: { toHaveScreenshot: { animations: "disabled", caret: "hide", scale: "css", maxDiffPixelRatio: 0.002 } },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: external ? undefined : {
    command: "pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
