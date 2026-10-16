import { writeFileSync, mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { block, openEditor } from "./support";

/**
 * Real-browser timing for the lesson editor at the sizes the epic names: mount, keystroke to next
 * frame (p50/p95 over 40 keys) and frame intervals while a block is dragged across the page.
 * Opt in with LX_EDITOR_TIMING=1; results go to test-results/editor-timing.json. Numbers depend on
 * the machine, so the suite reports them; the fixed gates are the targets from #341, checked only
 * up to the 500-block storage limit (1,000 is an unsaved stress case).
 */
test.skip(!process.env.LX_EDITOR_TIMING, "Set LX_EDITOR_TIMING=1 to measure.");
test.describe.configure({ mode: "serial" });

const results: Record<string, unknown>[] = [];
const pct = (values: number[], p: number) => { const s = [...values].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10; };

for (const size of [50, 200, 500, 1000]) {
  test(`${size} blocks`, async ({ page }) => {
    test.setTimeout(120_000);
    const start = Date.now();
    await openEditor(page, { fixture: "long", size: String(size) });
    const mountMs = Date.now() - start;

    // Keystroke → next frame, measured in the page.
    await page.evaluate(() => {
      const w = window as unknown as { __lat: number[]; __t0: number };
      w.__lat = [];
      document.addEventListener("keydown", () => { w.__t0 = performance.now(); }, true);
      document.addEventListener("input", () => {
        const t0 = w.__t0;
        requestAnimationFrame(() => setTimeout(() => w.__lat.push(performance.now() - t0), 0));
      }, true);
    });
    const middle = `editor_${Math.floor(size / 2) - (Math.floor(size / 2) % 20)}`;
    await block(page, middle).scrollIntoViewIfNeeded();
    await page.evaluate((id) => { const e = window.__editor!; e.setTextCursorPosition(id, "end"); e.focus(); }, middle);
    for (let i = 0; i < 40; i++) await page.keyboard.press(i % 8 === 7 ? "Backspace" : "a", { delay: 20 });
    const typing = await page.evaluate(() => (window as unknown as { __lat: number[] }).__lat);

    // Frame intervals while dragging a block down the page.
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __rec: boolean };
      w.__frames = []; w.__rec = true;
      let last = performance.now();
      const tick = (now: number) => { w.__frames.push(now - last); last = now; if (w.__rec) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    const source = block(page, "editor_0").locator(".bn-block-content").first();
    await source.scrollIntoViewIfNeeded();
    const box = (await source.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 4); await page.mouse.move(box.x + 32, box.y + 6);
    const handle = (await page.locator(".lx-side-menu__handle").boundingBox())!;
    await page.mouse.move(handle.x + 9, handle.y + 12);
    await page.mouse.down();
    for (let i = 1; i <= 60; i++) await page.mouse.move(box.x + 60, box.y + 10 + i * 8);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    const frames = await page.evaluate(() => { const w = window as unknown as { __frames: number[]; __rec: boolean }; w.__rec = false; return w.__frames.slice(1); });

    const row = { size, mountMs, typingP50: pct(typing, 0.5), typingP95: pct(typing, 0.95), samples: typing.length, dragFrameP50: pct(frames, 0.5), dragFrameP95: pct(frames, 0.95), longFrames: frames.filter((f) => f > 50).length, frames: frames.length };
    results.push(row);
    console.log(JSON.stringify(row));
    expect(typing.length).toBeGreaterThanOrEqual(30);
    if (size <= 500) expect(row.typingP95, "keystroke to next frame, p95").toBeLessThan(50);
  });
}

test.afterAll(() => {
  if (!results.length) return;
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/editor-timing.json", JSON.stringify({ userAgent: "playwright chromium", results }, null, 2));
});
