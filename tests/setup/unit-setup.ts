import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// `globals: false` (see vitest.unit.config.mts) means Testing Library's
// automatic cleanup, which only self-registers when it finds a global
// `afterEach`, never fires — do it explicitly instead.
afterEach(() => {
  cleanup();
});

// jsdom has no matchMedia; avatars' pointer gaze (blobatar/gaze) reads it on mount. Every browser has it.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
}
// The gaze driver also watches avatar size with ResizeObserver, which jsdom lacks.
if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
