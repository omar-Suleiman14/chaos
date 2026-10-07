import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Reader geometry in Chromium with the shipped stylesheets: the theme toggle keeps its size,
 * block ⋯ menus never cover text, the outline folds, and 320px phones do not scroll sideways.
 * The markup mirrors what BlockRenderer, LessonReader, Outline and ReadingMenu render.
 */
const css = ["app/workspace.css", "components/learn/learn.css"].map((p) => readFileSync(p, "utf8")).join("\n");
const handle = `<div class="lx-block__handle"><div class="relative"><button type="button" class="lx-block-action" aria-label="Actions">⋯</button></div></div>`;
const long = "Cerebrospinal fluid circulates from the lateral ventricles through the interventricular foramina into the third ventricle and onward.";
const article = (dir: "ltr" | "rtl") => `
  <article class="lx-article" dir="${dir}">
    <div class="lx-block" id="h" data-block-id="h" data-type="heading">${handle}<h2>Lecture 1: Anatomical Parts of the Nervous System and Spinal Cord</h2></div>
    <div class="lx-block" id="p" data-block-id="p" data-type="paragraph">${handle}<p>${long}</p></div>
    <ol class="lx-block" data-type="list"><li id="li" data-block-id="li" style="position:relative">${handle}<p>${long}</p></li></ol>
    <div class="lx-block" id="ar" data-block-id="ar" data-type="paragraph" dir="rtl">${handle}<p>يمر السائل الدماغي الشوكي من البطينات الجانبية عبر الثقب بين البطينين إلى البطين الثالث ثم إلى CSF.</p></div>
  </article>`;
const page = (dir: "ltr" | "rtl" = "ltr", outline: "open" | "closed" = "open") => `<!doctype html><html dir="${dir}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}
  .relative { position: relative; } body { margin: 0; font-family: system-ui, sans-serif; }
  .ws-menu { animation: none; } /* measured settled, not mid pop-in */</style></head>
  <body class="workspace-ui"><div class="lx-reader-root" dir="${dir}">
    <div class="lx-reader" data-side="closed" data-width="normal" data-outline="${outline}">
      <aside class="lx-reader__toc"><div class="lx-toc-desk" ${outline === "closed" ? "data-collapsed" : ""}>
        <div class="lx-toc-desk__head"><button type="button" class="ws-icon-button lx-toc-toggle" aria-label="Toggle sidebar">▢</button><p class="lx-toc__title lx-toc-desk__title">On this page</p></div>
        <div class="lx-toc-desk__body" ${outline === "closed" ? "inert" : ""}><nav class="lx-toc"><a href="#h" data-level="1">Lecture 1: Anatomical Parts of the Nervous System</a></nav></div>
      </div></aside>
      <main class="lx-reader__main">${article(dir)}</main>
    </div></div>
    <div class="ws-menu ws-glass lx-reading-menu" role="menu" style="position:fixed; top: 60px; right: 12px">
      <div class="lx-reading-menu__body">
        <div class="lx-reading-menu__group"><span class="lx-reading-menu__label">Text size</span><div class="lx-chips"><button class="lx-chip" role="menuitemradio">Small</button><button class="lx-chip" role="menuitemradio" aria-checked="true">Normal</button><button class="lx-chip" role="menuitemradio">Large</button></div></div>
        <div class="lx-reading-menu__appearance"><span class="lx-reading-menu__label">Appearance</span>
          <button type="button" class="theme-toggle relative inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted ws-icon-button" aria-label="Use dark appearance">
            <svg class="theme-toggle__sun" width="16" height="16"></svg><svg class="theme-toggle__moon" width="16" height="16"></svg></button></div>
      </div>
    </div>
  </body></html>`;

/** Bounding boxes of the rendered text of an element (one per line), via a DOM range. */
const textBoxes = (p: Page, selector: string) => p.evaluate((sel) => {
  const el = document.querySelector(sel)!;
  const range = document.createRange();
  range.selectNodeContents(el);
  return Array.from(range.getClientRects()).map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
}, selector);
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe("theme toggle", () => {
  test("keeps an icon-sized, stable box at rest, on hover and on focus", async ({ page: p }) => {
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.setContent(page());
    const toggle = p.locator(".theme-toggle");
    const rest = (await toggle.boundingBox())!;
    expect(rest.width).toBeLessThanOrEqual(44);
    expect(rest.height).toBeCloseTo(rest.width, 1);
    await toggle.hover();
    expect(await toggle.boundingBox()).toEqual(rest);
    await toggle.focus();
    expect(await toggle.boundingBox()).toEqual(rest);
    // The Appearance label keeps its row: the toggle does not swallow it.
    const label = (await p.locator(".lx-reading-menu__appearance .lx-reading-menu__label").boundingBox())!;
    expect(label.x + label.width).toBeLessThan(rest.x);
  });

  test("chips stay chips inside the menu instead of full-width rows", async ({ page: p }) => {
    await p.setContent(page());
    const chips = await p.locator(".lx-chip").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(new Set(chips.map(Math.round)).size).toBe(1);
  });
});

test.describe("block ⋯ menu", () => {
  for (const dir of ["ltr", "rtl"] as const) {
    test(`sits in the gutter beside the text on large screens (${dir})`, async ({ page: p }) => {
      await p.setViewportSize({ width: 1400, height: 900 });
      await p.setContent(page(dir));
      for (const id of ["h", "p", "li", "ar"]) {
        await p.locator(`#${id}`).hover({ position: { x: 40, y: 5 } });
        const button = (await p.locator(`#${id} > .lx-block__handle .lx-block-action`).boundingBox())!;
        expect(button, id).not.toBeNull();
        await expect(p.locator(`#${id} > .lx-block__handle`), id).toHaveCSS("opacity", "1");
        for (const line of await textBoxes(p, `#${id} > :is(p, h2)`)) expect(overlaps(button, line), `${dir} ${id}`).toBe(false);
        if (id === "li") {
          // Ordered-list numbers are text too.
          const marker = await p.locator("#li").evaluate((li) => { const r = li.getBoundingClientRect(); return { x: getComputedStyle(li).direction === "rtl" ? r.right : r.left - 24, y: r.top, width: 24, height: 20 }; });
          expect(overlaps(button, marker), `${dir} list number`).toBe(false);
        }
      }
    });
  }

  for (const width of [320, 390, 820]) {
    test(`never covers text on a ${width}px touch screen and does not shift layout`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 700 }, hasTouch: true, isMobile: true });
      const p = await context.newPage();
      for (const dir of ["ltr", "rtl"] as const) {
        await p.setContent(page(dir));
        const before = await p.locator("#p").boundingBox();
        await p.locator("#p").evaluate((el) => el.setAttribute("data-active", "true"));
        await p.locator("#li").evaluate((el) => el.setAttribute("data-active", "true"));
        expect(await p.locator("#p").boundingBox()).toEqual(before);
        for (const id of ["p", "li"]) {
          const handle = await p.locator(`#${id} > .lx-block__handle`).evaluate((e) => getComputedStyle(e).display);
          expect(handle, `${dir} ${id}`).toBe("none");
        }
        expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      // The docked bar is fixed inside the screen, outside the lesson's flow.
      await p.evaluate(() => document.body.insertAdjacentHTML("beforeend", `<div class="lx-block-bar ws-glass" role="toolbar"><button class="ws-btn ws-btn--sm ws-btn--ghost">⋯ Actions for this part</button><button class="ws-icon-button">×</button></div>`));
      const bar = (await p.locator(".lx-block-bar").boundingBox())!;
      expect(bar.x).toBeGreaterThanOrEqual(0);
      expect(bar.x + bar.width).toBeLessThanOrEqual(width);
      expect(bar.y + bar.height).toBeLessThanOrEqual(700);
      await context.close();
    });
  }
});

test.describe("outline sidebar", () => {
  test("folded, the lesson centres and the toggle stays reachable without covering it", async ({ page: p }) => {
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.setContent(page("ltr", "closed"));
    const main = (await p.locator(".lx-reader__main").boundingBox())!;
    const reader = (await p.locator(".lx-reader").boundingBox())!;
    const centre = reader.x + reader.width / 2;
    expect(Math.abs(main.x + main.width / 2 - centre)).toBeLessThan(40);
    const toggle = (await p.locator(".lx-toc-toggle").boundingBox())!;
    expect(overlaps(toggle, main)).toBe(false);
    expect(await p.locator(".lx-toc-desk__body").evaluate((e) => getComputedStyle(e).visibility)).toBe("hidden");
  });

  test("open, the outline takes its column beside the lesson (and mirrors in RTL)", async ({ page: p }) => {
    await p.setViewportSize({ width: 1440, height: 900 });
    for (const dir of ["ltr", "rtl"] as const) {
      await p.setContent(page(dir, "open"));
      const toc = (await p.locator(".lx-toc").boundingBox())!;
      const main = (await p.locator(".lx-reader__main").boundingBox())!;
      expect(overlaps(toc, main)).toBe(false);
      expect(dir === "ltr" ? toc.x < main.x : toc.x > main.x).toBe(true);
    }
  });

  test("on tablets and phones the desktop sidebar is not shown at all", async ({ page: p }) => {
    await p.setViewportSize({ width: 900, height: 900 });
    await p.setContent(page("ltr", "closed"));
    expect(await p.locator(".lx-reader__toc").evaluate((e) => getComputedStyle(e).display)).toBe("none");
  });
});
