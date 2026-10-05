import { afterEach, beforeEach, vi } from "vitest";
import { act, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import "@testing-library/jest-dom/vitest";
import Toaster from "@/components/Toaster";
import { toastStore } from "@/lib/toast";

// The app mounts one <Toaster /> in the root layout; every test gets one too, so a test finds an
// action's outcome (and its Undo button) where people see it.
let toaster: { root: Root; host: HTMLElement } | null = null;
beforeEach(() => {
  if (typeof document === "undefined") return; // node-environment tests
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(Toaster)));
    toaster = { root, host };
  } catch {
    // A test that mocks the locale module without useCopy renders no toaster.
    host.remove();
  }
});

// `globals: false` (see vitest.unit.config.mts) means Testing Library's
// automatic cleanup, which only self-registers when it finds a global
// `afterEach`, never fires — do it explicitly instead.
afterEach(() => {
  cleanup();
  if (toaster) {
    const { root, host } = toaster;
    act(() => root.unmount());
    host.remove();
    toaster = null;
  }
  toastStore.reset();
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

vi.mock("@/lib/cardFonts", () => ({ cardRuqaa: { variable: "test-ruqaa" } }));
