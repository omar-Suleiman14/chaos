import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Pure logic and React component tests. No network, no Convex backend, no
// Clerk — everything here runs against jsdom with Convex/Clerk mocked at the
// module boundary. See tests/integration for real Convex function tests.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup/unit-setup.ts"],
    globals: false,
  },
});
