import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import babelParser from "@babel/eslint-parser";
import convexPlugin from "@convex-dev/eslint-plugin";

// Framework rules need syntax, not the legacy TypeScript compiler API.
// Babel parses TS/TSX while TypeScript 7 owns all semantic checking.
export default defineConfig([
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: { parserOpts: { plugins: ["typescript", "jsx"] } },
      },
    },
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  ...convexPlugin.configs.recommended,
  globalIgnores([
    "convex/_generated",
    "convex/*/_generated",
    ".next",
    ".claude/worktrees",
    "test-results",
    "playwright-report",
    "blob-report",
    "coverage",
  ]),
]);
