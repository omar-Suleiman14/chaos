import { defineConfig, devices } from "@playwright/test";

// Lesson editor interactions in real Chromium: the real LessonEditor and BlockNote mounted by
// tests/editor/harness (vite.editor.config.mts), no app server or backend.
// `pnpm test:editor` builds the harness and serves it on :4173.
export default defineConfig({
  testDir: "./tests/editor",
  fullyParallel: true,
  reporter: "list",
  timeout: 45_000,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm exec vite build --config vite.editor.config.mts --logLevel error && pnpm exec vite preview --config vite.editor.config.mts --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath: process.env.CHAOS_CHROMIUM || undefined } } },
  ],
});
