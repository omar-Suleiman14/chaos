import { expect, test } from "@playwright/test";
import { block, caretAtEnd, doc, hoverBlock, openEditor, order, paste, rect } from "./support";

test.describe("insert controls and the / menu", () => {
  test("+ opens the menu on a new line below; choosing inserts exactly one block there", async ({ page }) => {
    await openEditor(page);
    const menu = await hoverBlock(page, "p1");
    const before = (await order(page)).length;
    await menu.locator(".lx-side-menu__add").click();
    const slash = page.locator(".bn-suggestion-menu");
    await expect(slash).toBeVisible();
    // Next to the new line, not somewhere else on the page.
    const line = await rect(block(page, "p1"));
    expect((await rect(slash)).y).toBeGreaterThan(line.y);
    await page.keyboard.type("callout");
    await page.keyboard.press("Enter");
    await expect(slash).toBeHidden();
    const ids = await order(page);
    const inserted = ids[ids.indexOf("p1") + 1];
    expect(ids).toHaveLength(before + 1);
    expect((await doc(page)).find((b) => b.id === inserted)?.type).toBe("callout");
  });

  test("typing / filters, arrows move, Escape closes without inserting", async ({ page }) => {
    await openEditor(page);
    await caretAtEnd(page, "p2");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/head");
    const items = page.locator('.bn-suggestion-menu [role="option"]');
    await expect(items.first()).toContainText("Heading 1");
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator(".bn-suggestion-menu")).toBeHidden();
    expect((await doc(page)).filter((b) => b.type === "heading")).toHaveLength(1);
  });

  test("shows an empty state when nothing matches", async ({ page }) => {
    await openEditor(page);
    await caretAtEnd(page, "p2");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/zzqx");
    await expect(page.locator(".bn-suggestion-menu")).toContainText(/No items|لا/);
  });

  test("searches in Arabic, ignoring hamza and diacritics", async ({ page }) => {
    await openEditor(page, { doc: "ar", ui: "ar" });
    await caretAtEnd(page, "p2");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/إختبار");
    await expect(page.locator('.bn-suggestion-menu [role="option"]').first()).toContainText("اختبار");
    await page.keyboard.press("Enter");
    expect((await doc(page)).some((b) => b.type === "lessonQuiz" && b.id !== "q1")).toBe(true);
  });
});

test.describe("block actions", () => {
  test("the handle stays while the pointer moves onto it, and a click opens the actions", async ({ page }) => {
    await openEditor(page);
    const menu = await hoverBlock(page, "p1");
    const handle = menu.locator(".lx-side-menu__handle");
    const box = await rect(handle);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await expect(handle).toBeVisible();
    await handle.click();
    await expect(page.locator(".lx-block-menu")).toBeVisible();
    await expect(page.locator(".lx-block-menu")).toContainText("Duplicate");
    await page.keyboard.press("Escape");
    await expect(page.locator(".lx-block-menu")).toBeHidden();
  });

  test("duplicate keeps content and props under a new id; delete is undoable", async ({ page }) => {
    await openEditor(page);
    await (await hoverBlock(page, "q1")).locator(".lx-side-menu__handle").click();
    await page.locator(".lx-block-menu__item", { hasText: "Duplicate" }).click();
    const ids = await order(page);
    const copy = ids[ids.indexOf("q1") + 1];
    expect(copy).not.toBe("q1");
    const blocks = await doc(page);
    expect(blocks.find((b) => b.id === copy)!.props).toEqual(blocks.find((b) => b.id === "q1")!.props);
    await expect(page.locator("[data-lx-editor-live]")).toHaveText("Duplicated");

    await (await hoverBlock(page, "p2")).locator(".lx-side-menu__handle").click();
    await page.locator(".lx-block-menu__item", { hasText: "Delete" }).click();
    expect(await order(page)).not.toContain("p2");
    await expect.poll(() => page.evaluate(() => window.__editor!.isFocused())).toBe(true);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await order(page)).toContain("p2");
  });

  test("move up/down from the menu and with Ctrl+Shift+arrows", async ({ page }) => {
    await openEditor(page);
    await (await hoverBlock(page, "p2")).locator(".lx-side-menu__handle").click();
    await page.locator(".lx-block-menu__item", { hasText: "Move up" }).click();
    expect((await order(page)).slice(0, 3)).toEqual(["h1", "p2", "p1"]);
    await caretAtEnd(page, "p2");
    await page.keyboard.press("ControlOrMeta+Shift+ArrowDown");
    expect((await order(page)).slice(0, 3)).toEqual(["h1", "p1", "p2"]);
  });

  test("Ctrl+D duplicates the block under the caret", async ({ page }) => {
    await openEditor(page);
    const before = (await order(page)).length;
    await caretAtEnd(page, "p2");
    await page.keyboard.press("ControlOrMeta+d");
    const ids = await order(page);
    expect(ids).toHaveLength(before + 1);
    expect((await doc(page))[ids.indexOf("p2") + 1].content).toEqual((await doc(page))[ids.indexOf("p2")].content);
  });

  test("turn into changes the type in place and keeps text and children", async ({ page }) => {
    await openEditor(page);
    await (await hoverBlock(page, "b1")).locator(".lx-side-menu__handle").click();
    await page.getByText("Turn into").click();
    await page.locator('[role="menuitemcheckbox"]', { hasText: "Heading 2" }).click();
    const b1 = (await doc(page)).find((b) => b.id === "b1")!;
    expect(b1).toMatchObject({ type: "heading", props: { level: 2 } });
    expect(b1.children.map((c) => c.id)).toEqual(["b1c"]);
  });
});

test.describe("keyboard and clipboard", () => {
  test("Enter in the title continues at the start of the document", async ({ page }) => {
    await openEditor(page);
    await page.getByLabel("Title").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Title")).toHaveValue("Circulation basics");
    await page.keyboard.type("X");
    expect(((await doc(page))[0].content as { text: string }[])[0].text.startsWith("X")).toBe(true);
  });

  test("Tab and Shift+Tab nest and un-nest list items", async ({ page }) => {
    await openEditor(page);
    await caretAtEnd(page, "b2");
    await page.keyboard.press("Tab");
    expect(await order(page, "b1")).toEqual(["b1c", "b2"]);
    await page.keyboard.press("Shift+Tab");
    expect(await order(page, "b1")).toEqual(["b1c"]);
  });

  test("the formatting toolbar keeps the selection and applies bold", async ({ page }) => {
    await openEditor(page);
    const text = await rect(block(page, "p2").locator(".bn-inline-content"));
    await page.mouse.move(text.x + 1, text.y + text.height / 2);
    await page.mouse.down();
    await page.mouse.move(text.x + 60, text.y + text.height / 2, { steps: 5 });
    await page.mouse.up();
    const toolbar = page.locator(".bn-toolbar");
    await expect(toolbar).toBeVisible();
    const selected = await page.evaluate(() => window.__editor!.getSelectedText());
    expect(selected.length).toBeGreaterThan(3);
    await toolbar.locator('[data-test="bold"], button[aria-label^="Bold"]').first().click();
    expect(await page.evaluate(() => window.__editor!.getSelectedText())).toBe(selected);
    const runs = (await doc(page)).find((b) => b.id === "p2")!.content as { styles: Record<string, boolean> }[];
    expect(runs.some((r) => r.styles.bold)).toBe(true);
  });

  test("pastes HTML headings, lists and bold as blocks", async ({ page }) => {
    await openEditor(page);
    await caretAtEnd(page, "p2");
    await page.keyboard.press("Enter");
    await paste(page, { "text/html": "<h2>Pasted heading</h2><ul><li>One</li><li><strong>Two</strong></li></ul><p>Plain</p>", "text/plain": "Pasted heading\nOne\nTwo\nPlain" });
    const types = (await doc(page)).map((b) => b.type);
    expect(types).toEqual(expect.arrayContaining(["heading", "bulletListItem"]));
    const two = (await doc(page)).find((b) => Array.isArray(b.content) && (b.content as { text?: string }[]).some((c) => c.text === "Two"))!;
    expect((two.content as { styles: Record<string, boolean> }[])[0].styles.bold).toBe(true);
  });

  test("pastes Markdown text as blocks", async ({ page }) => {
    await openEditor(page);
    await caretAtEnd(page, "p2");
    await page.keyboard.press("Enter");
    await paste(page, { "text/plain": "## Markdown heading\n\n- first\n- second" });
    const blocks = await doc(page);
    expect(blocks.some((b) => b.type === "heading")).toBe(true);
    expect(blocks.filter((b) => b.type === "bulletListItem").length).toBeGreaterThanOrEqual(4);
  });
});

test.describe("geometry", () => {
  for (const dir of ["ltr", "rtl"] as const) {
    test(`title, description and body share one text edge (${dir})`, async ({ page }) => {
      await openEditor(page, dir === "rtl" ? { doc: "ar", ui: "ar" } : {});
      const title = await page.getByLabel("Title").evaluate((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { start: r.left + parseFloat(s.paddingLeft), end: r.right - parseFloat(s.paddingRight) }; });
      const body = await rect(block(page, "p1").locator(".bn-inline-content"));
      if (dir === "ltr") expect(Math.abs(title.start - body.x)).toBeLessThanOrEqual(1);
      else expect(Math.abs(title.end - (body.x + body.width))).toBeLessThanOrEqual(1);
    });

    test(`handles sit beside each block's first line on its start side (${dir})`, async ({ page }) => {
      await openEditor(page, dir === "rtl" ? { doc: "ar", ui: "ar" } : {});
      for (const id of ["h1", "p1", "b1c", "img1", "q1"]) {
        const menu = await hoverBlock(page, id);
        const handle = await rect(menu);
        const content = await rect(block(page, id).locator(".bn-block-content").first());
        const firstLine = await block(page, id).locator(".bn-block-content").first().evaluate((el) => {
          const inline = el.querySelector(".bn-inline-content");
          if (!inline) return null;
          const range = document.createRange(); range.selectNodeContents(inline);
          const r = range.getClientRects()[0];
          return r ? { top: r.top, bottom: r.bottom } : null;
        });
        if (dir === "ltr") expect(handle.x + handle.width).toBeLessThanOrEqual(content.x + 1);
        else expect(handle.x).toBeGreaterThanOrEqual(content.x + content.width - 1);
        expect(Math.abs(handle.x + handle.width / 2 - (dir === "ltr" ? content.x : content.x + content.width))).toBeLessThan(70);
        if (firstLine) {
          const center = handle.y + handle.height / 2;
          expect(center, `${id} handle centred on its first line`).toBeGreaterThanOrEqual(firstLine.top - 1);
          expect(center).toBeLessThanOrEqual(firstLine.bottom + 1);
        } else {
          expect(Math.abs(handle.y - content.y)).toBeLessThan(16);
        }
      }
    });
  }

  test("dark mode menus are opaque enough to read over text", async ({ page }) => {
    await openEditor(page, { theme: "dark" });
    await (await hoverBlock(page, "p1")).locator(".lx-side-menu__handle").click();
    const alpha = await page.locator(".lx-block-menu").evaluate((el) => {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)!.map(Number);
      return m.length > 3 ? m[3] : 1;
    });
    expect(alpha).toBeGreaterThanOrEqual(0.97);
  });
});
