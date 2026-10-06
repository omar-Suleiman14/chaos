import { defineConfig, devices } from "@playwright/test";

// Browser journey timings (perf/browser). Runs only against a deployed,
// non-production E2E environment; see perf/README.md.
export default defineConfig({
  testDir: "./perf/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "perf/results/playwright.json" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
