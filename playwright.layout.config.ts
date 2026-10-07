import { defineConfig, devices } from "@playwright/test";

// Layout contracts measured in real Chromium against the app's own stylesheets (no app server,
// no backend): `pnpm exec playwright test -c playwright.layout.config.ts`.
export default defineConfig({
  testDir: "./tests/layout",
  fullyParallel: true,
  reporter: "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: process.env.CHAOS_CHROMIUM || undefined } } }],
});
