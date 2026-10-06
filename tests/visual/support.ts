import { expect, type Page } from "@playwright/test";

/** Which suite this run records: the hermetic site build (default) or the app against the E2E environment. */
export const suite = process.env.VISUAL_SUITE === "app" ? "app" : "site";

export const schemes = ["light", "dark"] as const;
export type Scheme = (typeof schemes)[number];

/**
 * Keeps a page hermetic: requests to other origins are aborted, and the Convex
 * socket is accepted and left silent, so data-backed parts hold their loading
 * state instead of retrying, reconnecting or showing an offline banner.
 */
export async function isolate(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin;
  await page.routeWebSocket(/./, () => { /* accepted, never answered */ });
  await page.route((url) => url.origin !== origin, (route) => route.abort());
}

/** Navigates and fails at once on a server error, rather than timing out waiting for content. */
export async function open(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "load" });
  const status = response?.status() ?? 0;
  if (status >= 400) throw new Error(`${path} answered ${status}; the server is misconfigured, not the page's look`);
}

/** Light or dark the way people get it: the stored preference the theme script reads first. */
export async function useScheme(page: Page, scheme: Scheme) {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.addInitScript((value) => { try { localStorage.setItem("chaos-theme", value); } catch { /* storage denied */ } }, scheme);
}

/** Waits for fonts, images in view and two quiet frames before the screenshot. */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter((img) => !img.complete && img.loading !== "lazy").map((img) => new Promise((r) => { img.onload = img.onerror = r; })));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/** Parts that change on their own (clocks, relative times, live counts). */
export const volatile = (page: Page) => [page.locator("time"), page.locator("[data-visual-volatile]")];

export async function snap(page: Page, name: string, options: { fullPage?: boolean; maxDiffPixelRatio?: number } = {}) {
  await settle(page);
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: options.fullPage ?? false, mask: volatile(page), maxDiffPixelRatio: options.maxDiffPixelRatio });
}
