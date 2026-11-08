import { expect, test } from "@playwright/test";
import { caretAtEnd, doc, openEditor, paste } from "./support";
import { toDurableDocument } from "@/lib/learn/chaosDocument";

/** Content entering the editor from outside (paste, links, files) in real Chromium. */
test.describe("content safety", () => {
  test("Word paste keeps text and structure, drops markup, scripts and images, and says what was left out", async ({ page }) => {
    const { errors } = await openEditor(page);
    const images = async () => (await doc(page)).filter((b) => b.type === "image").length;
    const imagesBefore = await images();
    await caretAtEnd(page, "p2");
    await page.keyboard.press("Enter");
    await paste(page, {
      "text/html": `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>.MsoNormal{mso-x:1}</style></head><body><!--[if gte mso 9]><xml></xml><![endif]-->
        <h2 class="MsoHeading2">From Word</h2><p class="MsoNormal" style="mso-line-height:12pt" onclick="window.__pwned=1"><b>Bold</b> body<o:p></o:p></p>
        <p><a href="javascript:window.__pwned=1">click</a></p><img src="https://cdn.example/x.png" onerror="window.__pwned=1"><script>window.__pwned=1</script></body></html>`,
      "text/plain": "From Word\nBold body\nclick",
    });
    const blocks = await doc(page);
    const json = JSON.stringify(blocks);
    expect(json).toContain("From Word");
    expect(json).toContain("Bold");
    expect(json).not.toMatch(/javascript:|mso|onclick|cdn\.example/);
    expect(await images()).toBe(imagesBefore);
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(await page.evaluate(() => window.__events.filter((e) => e.startsWith("notice:")))).toEqual([expect.stringMatching(/1 pasted image left out/)]);
    // What was pasted saves through the durable path (the pasted blocks, as the page would save them).
    const pasted = blocks.filter((b) => JSON.stringify(b).match(/From Word|Bold body|click/));
    expect(pasted.length).toBeGreaterThan(0);
    expect(() => toDurableDocument(JSON.parse(JSON.stringify(pasted)))).not.toThrow();
    expect(errors).toEqual([]);
  });

  test("a link the lesson cannot store is never created; a bare address becomes https", async ({ page }) => {
    await openEditor(page);
    await page.evaluate(() => {
      const e = window.__editor!;
      e.setTextCursorPosition("p2", "end");
      e.createLink("javascript:alert(1)", " bad");
      e.createLink("tel:123", " phone");
      e.createLink("example.com/notes", " notes");
    });
    const last = JSON.stringify(await page.evaluate(() => window.__changes.at(-1)));
    expect(last).not.toMatch(/javascript:|tel:/);
    expect(last).toContain('"href":"https://example.com/notes"');
    await expect(page.locator('.lx-editor a[href^="javascript:"]')).toHaveCount(0);
  });

  test("pasting inside a code block stays plain text", async ({ page }) => {
    await openEditor(page);
    await page.evaluate(() => {
      const e = window.__editor!;
      const [code] = e.insertBlocks([{ type: "codeBlock", props: { language: "javascript" } }], "p2", "after");
      e.setTextCursorPosition(code, "end");
      e.focus();
    });
    await paste(page, { "text/html": "<b>not bold</b>", "text/plain": "const x = 1;" });
    const code = (await doc(page)).find((b) => b.type === "codeBlock")!;
    expect(JSON.stringify(code.content)).toContain("const x = 1;");
  });
});
