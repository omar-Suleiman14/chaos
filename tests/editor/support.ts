import { expect, type Locator, type Page } from "@playwright/test";

/** Opens the harness (tests/editor/harness) and waits for the real editor to mount. */
export async function openEditor(page: Page, query: Record<string, string> = {}) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`/?${new URLSearchParams(query)}`);
  await page.waitForFunction(() => !!window.__editor);
  await expect(page.locator(".bn-editor")).toBeVisible();
  return { errors };
}

export const block = (page: Page, id: string) => page.locator(`.lx-editor .bn-block-outer[data-id="${id}"]`);
export const blockText = (page: Page, id: string) => block(page, id).locator(".bn-inline-content").first();

/** Top-level block ids in document order (or the children of `parent`). */
export const order = (page: Page, parent?: string) =>
  page.evaluate((parentId) => {
    const editor = window.__editor!;
    const blocks = parentId ? editor.getBlock(parentId)!.children : editor.document;
    return blocks.map((b) => b.id);
  }, parent);

export async function hoverBlock(page: Page, id: string) {
  const target = block(page, id).locator(".bn-block-content").first();
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 2);
  await page.mouse.move(box.x + 32, box.y + 6);
  const menu = page.locator(".lx-side-menu");
  await expect(menu).toBeVisible();
  return menu;
}

/** Drags block `id` by its handle to just above (or below) block `target`. */
export async function dragBlock(page: Page, id: string, target: string, where: "above" | "below", steps = 12) {
  const menu = await hoverBlock(page, id);
  const handle = menu.locator(".lx-side-menu__handle");
  const from = (await handle.boundingBox())!;
  const to = (await block(page, target).locator(".bn-block-content").first().boundingBox())!;
  const y = where === "above" ? to.y + 3 : to.y + to.height - 3;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 4, from.y + 10, { steps: 2 });
  await page.mouse.move(to.x + 40, y, { steps });
  // Chromium delivers dragover with pointer movement; one more nudge settles it at the final point.
  await page.mouse.move(to.x + 41, y);
  return {
    drop: async () => { await page.mouse.up(); },
  };
}

export async function rect(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element is not rendered");
  return box;
}
