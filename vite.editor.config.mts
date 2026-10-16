import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/postcss";

// Browser harness for the lesson editor (tests/editor): the real LessonEditor, BlockNote and
// stylesheets, with only the Next and Convex boundaries stubbed. Driven by playwright.editor.config.ts.
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  root: here("tests/editor/harness"),
  plugins: [react()],
  css: { postcss: { plugins: [tailwind({ base: here("./") })] } },
  resolve: {
    alias: [
      { find: /^next\/dynamic$/, replacement: here("tests/editor/harness/next-dynamic.ts") },
      { find: /^next\/link$/, replacement: here("tests/editor/harness/next-link.ts") },
      { find: /^next\/navigation$/, replacement: here("tests/editor/harness/next-navigation.ts") },
      { find: /^convex\/react$/, replacement: here("tests/editor/harness/convex-react.ts") },
      { find: /^@\//, replacement: here("./") },
    ],
  },
  define: { "process.env": "{}" },
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { outDir: here("node_modules/.cache/editor-harness"), emptyOutDir: true },
});
