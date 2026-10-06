import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Performance budgets (perf/README.md). Backend suites run real Convex
// handlers in convex-test and read its transaction accounting; client suites
// render real components in jsdom and count React commits and DOM work.
// Results land in perf/results and scripts/perf-ratchet.ts compares them with
// perf/baselines.
const alias = { "@": fileURLToPath(new URL(".", import.meta.url)) };
export default defineConfig({
  resolve: { alias },
  test: {
    reporters: ["default", "./perf/lib/reporter.ts"],
    projects: [
      {
        resolve: { alias },
        test: {
          name: "backend",
          environment: "edge-runtime",
          include: ["perf/backend/**/*.perf.test.ts"],
          server: { deps: { inline: ["convex-test"] } },
          testTimeout: 180_000,
          hookTimeout: 180_000,
        },
      },
      {
        plugins: [react()],
        css: { postcss: { plugins: [] } },
        resolve: { alias },
        test: {
          name: "client",
          environment: "jsdom",
          include: ["perf/client/**/*.perf.test.tsx"],
          setupFiles: ["tests/setup/unit-setup.ts"],
          testTimeout: 180_000,
        },
      },
    ],
  },
});
