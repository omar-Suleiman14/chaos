import { expect, test } from "@playwright/test";
import { block, openEditor, order, rect } from "./support";

/** Touch phones: no hover gutter to aim at, so a tap shows the block's handle and its actions. */
for (const width of [390, 320]) {
  for (const lang of ["en", "ar"] as const) {
    test(`no sideways scrolling at ${width}px (${lang})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openEditor(page, lang === "ar" ? { doc: "ar", ui: "ar" } : {});
      const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("tapping a block shows a large handle (no +) whose actions fit on screen and work", async ({ page }) => {
  await openEditor(page);
  const text = await rect(block(page, "p1").locator(".bn-inline-content"));
  await page.touchscreen.tap(text.x + 20, text.y + 5);
  const handle = page.locator(".lx-side-menu__handle");
  await expect(handle).toBeVisible();
  await expect(page.locator(".lx-side-menu__add")).toBeHidden();
  const size = await rect(handle);
  expect(size.width).toBeGreaterThanOrEqual(26);
  expect(size.x).toBeGreaterThanOrEqual(0);
  await handle.tap();
  const menu = page.locator(".lx-block-menu");
  await expect(menu).toBeVisible();
  const box = await rect(menu);
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  await page.locator(".lx-block-menu__item", { hasText: "Move down" }).tap();
  expect((await order(page)).slice(0, 3)).toEqual(["h1", "p2", "p1"]);
});

test("the / menu fits a 320px screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openEditor(page);
  await page.evaluate(() => { const e = window.__editor!; e.setTextCursorPosition("p2", "end"); e.focus(); });
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  const menu = await rect(page.locator(".bn-suggestion-menu"));
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(320);
});

test("with the on-screen keyboard open, a toolbar sits above it and its + inserts a block", async ({ page }) => {
  await openEditor(page);
  const viewport = page.viewportSize()!;
  const text = await rect(block(page, "p1").locator(".bn-inline-content"));
  await page.touchscreen.tap(text.x + 40, text.y + 5);
  await expect.poll(() => page.evaluate(() => window.__editor!.isFocused())).toBe(true);
  // What a phone keyboard does with interactive-widget=resizes-content: same width, less height.
  await page.setViewportSize({ width: viewport.width, height: viewport.height - 320 });
  const toolbar = page.locator(".bn-mobile-formatting-toolbar");
  await expect(toolbar).toBeVisible();
  const bar = await rect(toolbar);
  expect(bar.y + bar.height).toBeLessThanOrEqual(viewport.height - 320 + 1);
  expect(bar.x).toBeGreaterThanOrEqual(0);
  expect(bar.x + bar.width).toBeLessThanOrEqual(viewport.width + 1);
  const before = (await order(page)).length;
  await toolbar.locator(".lx-mobile-insert").tap();
  await expect(page.locator(".bn-suggestion-menu")).toBeVisible();
  await page.keyboard.type("callout");
  await page.keyboard.press("Enter");
  const ids = await order(page);
  expect(ids).toHaveLength(before + 1);
  expect((await page.evaluate(() => window.__editor!.document))[ids.indexOf("p1") + 1].type).toBe("callout");
});
