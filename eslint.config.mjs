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
    },
  },
  globalIgnores(["convex/_generated"]),
]);
