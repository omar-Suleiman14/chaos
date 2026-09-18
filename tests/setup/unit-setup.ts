import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// `globals: false` (see vitest.unit.config.ts) means Testing Library's
// automatic cleanup, which only self-registers when it finds a global
// `afterEach`, never fires — do it explicitly instead.
afterEach(() => {
  cleanup();
});
