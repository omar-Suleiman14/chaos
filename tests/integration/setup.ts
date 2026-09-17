/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import schema from "../../convex/schema";

// import.meta.glob must be called directly in a file the Vite/Vitest
// transform sees; re-export the resolved map so every integration test can
// share one convexTest() factory instead of repeating this glob.
const modules = import.meta.glob("../../convex/**/*.*s");

export function createTestConvex() {
  return convexTest(schema, modules);
}
