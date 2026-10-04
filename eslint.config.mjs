import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import convexPlugin from "@convex-dev/eslint-plugin";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  ...convexPlugin.configs.recommended,
  {
    rules: {
      // This rule is far stricter than common React practice and
      // breaks typical hydration/mount patterns in Next.js client components.
      "react-hooks/set-state-in-effect": "off",

      // Allow incremental typing improvements without blocking builds.
      "@typescript-eslint/no-explicit-any": "warn",

      // A leading underscore marks a value left out on purpose, e.g. `const { id: _id, ...rest } = row`.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  globalIgnores(["convex/_generated", "convex/*/_generated", ".claude/worktrees", "test-results", "playwright-report", "blob-report", "coverage"]),
]);
