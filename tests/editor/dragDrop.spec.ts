import { expect, test } from "@playwright/test";
import { block, dragBlock, openEditor, order } from "./support";

test.describe("block drag and drop", () => {
  // Tall enough that source and destination are both on screen; autoscroll has its own test.
  test.use({ viewport: { width: 1440, height: 1600 } });

  test("moves a block between two paragraphs, keeps its id, and is one undo step", async ({ page }) => {
    await openEditor(page);
    expect(await order(page)).toEqual(["h1", "p1", "p2", "t1", "b1", "b2", "img1", "c1", "q1", "p3"]);
    const drag = await dragBlock(page, "p3", "p2", "above");
    await expect(page.locator(".lx-editor[data-dragging]")).toHaveCount(1);
    await expect(block(page, "p3")).toHaveCSS("opacity", "0.4");
    await expect(page.locator(".prosemirror-dropcursor-block")).toBeVisible();
    await drag.drop();
    expect(await order(page)).toEqual(["h1", "p1", "p3", "p2", "t1", "b1", "b2", "img1", "c1", "q1"]);
    await expect(page.locator(".lx-editor[data-dragging]")).toHaveCount(0);
    await expect(block(page, "p2")).toHaveCSS("opacity", "1");
    await expect(block(page, "p3")).toContainText("Last paragraph.");
    await page.evaluate(() => window.__editor!.undo());
    expect(await order(page)).toEqual(["h1", "p1", "p2", "t1", "b1", "b2", "img1", "c1", "q1", "p3"]);
    await page.evaluate(() => window.__editor!.redo());
    expect(await order(page)).toEqual(["h1", "p1", "p3", "p2", "t1", "b1", "b2", "img1", "c1", "q1"]);
  });

  test("drops below a block when released over its lower half", async ({ page }) => {
    await openEditor(page);
    await (await dragBlock(page, "p1", "p2", "below")).drop();
    expect((await order(page)).slice(0, 4)).toEqual(["h1", "p2", "p1", "t1"]);
  });

  test("drops below the last block, and the indicator shows where", async ({ page }) => {
    await openEditor(page);
    const drag = await dragBlock(page, "p1", "p3", "below");
    const last = (await block(page, "p3").boundingBox())!;
    // dragover arrives on the browser's drag timer, not with every pointer move.
    await expect.poll(async () => (await page.locator(".prosemirror-dropcursor-block").boundingBox())?.y ?? 0).toBeGreaterThan(last.y + last.height / 2);
    await drag.drop();
    expect((await order(page)).slice(-2)).toEqual(["p3", "p1"]);
  });

  test("nests a block as the first child when dropped on a parent's lower half", async ({ page }) => {
    await openEditor(page);
    await (await dragBlock(page, "p2", "b1", "below")).drop();
    expect(await order(page, "b1")).toEqual(["p2", "b1c"]);
    // A nested block drags on its own, out of its parent.
    await (await dragBlock(page, "p2", "p1", "above")).drop();
    expect(await order(page, "b1")).toEqual(["b1c"]);
    expect((await order(page)).slice(0, 3)).toEqual(["h1", "p2", "p1"]);
  });

  test("cannot drop a block into its own children", async ({ page }) => {
    await openEditor(page);
    const before = await page.evaluate(() => JSON.stringify(window.__editor!.document));
    await (await dragBlock(page, "b1", "b1c", "below")).drop();
    expect(await page.evaluate(() => JSON.stringify(window.__editor!.document))).toBe(before);
  });

  test("moves a parent with its nested children", async ({ page }) => {
    await openEditor(page);
    const drag = await dragBlock(page, "t1", "p1", "above");
    await drag.drop();
    expect(await order(page)).toEqual(["h1", "t1", "p1", "p2", "b1", "b2", "img1", "c1", "q1", "p3"]);
    expect(await order(page, "t1")).toEqual(["t1c1", "t1c2"]);
  });

  test("moves an image and an educational block without losing their references", async ({ page }) => {
    await openEditor(page);
    await (await dragBlock(page, "img1", "p1", "above")).drop();
    await (await dragBlock(page, "q1", "p2", "above")).drop();
    const moved = await page.evaluate(() => ({ img: window.__editor!.getBlock("img1")!.props, quiz: window.__editor!.getBlock("q1")!.props }));
    expect(moved.img).toMatchObject({ caption: "Heart diagram", alt: "Heart", credit: "Chaos", previewWidth: 480 });
    expect(moved.quiz).toMatchObject({ assetKind: "form", assetId: "form_123", required: true });
    expect((await order(page)).slice(0, 5)).toEqual(["h1", "img1", "p1", "q1", "p2"]);
  });

  test("moves several selected blocks together", async ({ page }) => {
    await openEditor(page);
    await page.evaluate(() => window.__editor!.setSelection("p1", "p2"));
    const drag = await dragBlock(page, "p1", "p3", "below");
    await drag.drop();
    expect(await order(page)).toEqual(["h1", "t1", "b1", "b2", "img1", "c1", "q1", "p3", "p1", "p2"]);
    await page.evaluate(() => window.__editor!.undo());
    expect(await order(page)).toEqual(["h1", "p1", "p2", "t1", "b1", "b2", "img1", "c1", "q1", "p3"]);
  });

  test("Escape cancels a drag: nothing moves, nothing is saved", async ({ page }) => {
    await openEditor(page);
    const before = await page.evaluate(() => JSON.stringify(window.__editor!.document));
    const changes = await page.evaluate(() => window.__changes.length);
    const drag = await dragBlock(page, "p1", "p3", "below");
    await page.keyboard.press("Escape");
    await drag.drop();
    expect(await page.evaluate(() => JSON.stringify(window.__editor!.document))).toBe(before);
    expect(await page.evaluate(() => window.__changes.length)).toBe(changes);
    await expect(page.locator(".lx-editor[data-dragging]")).toHaveCount(0);
  });

  test("pointer movement and hover never emit document changes", async ({ page }) => {
    await openEditor(page);
    const changes = await page.evaluate(() => window.__changes.length);
    for (const id of ["p1", "p2", "t1", "b1", "img1", "q1", "p3"]) {
      const box = (await block(page, id).boundingBox())!;
      await page.mouse.move(box.x + 20, box.y + 6, { steps: 4 });
    }
    expect(await page.evaluate(() => window.__changes.length)).toBe(changes);
  });
});

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 1440, height: 1600 }, reducedMotion: "reduce" });
  test("a drop moves the block without the settle animation", async ({ page }) => {
    await openEditor(page);
    await (await dragBlock(page, "p3", "p2", "above")).drop();
    expect((await order(page)).slice(0, 4)).toEqual(["h1", "p1", "p3", "p2"]);
    expect(await block(page, "p3").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  });
});
