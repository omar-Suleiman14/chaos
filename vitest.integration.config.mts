import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Convex function tests, run against convex-test's in-memory backend. The
// edge-runtime environment mirrors what Convex functions actually execute
// under, which jsdom does not.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "edge-runtime",
    include: ["tests/integration/**/*.test.ts"],
    globals: false,
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
