import { expect, test, type Page } from "@playwright/test";

/**
 * Framing checks from a third-party page. Playwright serves the "other site"
 * itself (page.route), so no second server is needed.
 *
 * The first test needs only the running app: every creator and app route must
 * refuse to be framed, whatever Convex says. The second needs a real Convex
 * deployment and a published form, prepared by hand:
 *   - a form with one required short-text question, published, access "Anyone";
 *   - Share → Embed on a website → Allow embedding, sites: https://embedder.test
 *   - E2E_EMBED_SHARE_ID=<its share id> pnpm test:e2e -- tests/e2e/embed.spec.ts
 */

const EMBEDDER = "https://embedder.test";
const OTHER_SITE = "https://other-site.test";

async function hostPage(page: Page, origin: string, frames: { id: string; src: string }[]) {
  await page.route(`${origin}/**`, (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><meta charset="utf-8"><title>Host</title>
      <script>window.heights=[];addEventListener("message",function(e){if(e.data&&e.data.type==="chaos:embed:height")window.heights.push(e.data.height)});</script>
      ${frames.map((f) => `<iframe id="${f.id}" src="${f.src}" style="width:100%;height:600px;border:0"></iframe>`).join("\n")}`,
  }));
}

/** The frame an <iframe id> ended up showing; Chromium swaps a blocked frame for an error page. */
async function frameUrl(page: Page, id: string) {
  const handle = await page.locator(`iframe#${id}`).elementHandle();
  return (await handle?.contentFrame())?.url() ?? "";
}

test("creator, admin and app routes cannot be framed by another site", async ({ page, baseURL }) => {
  const targets = ["/dashboard", "/dashboard/forms", "/admin", "/docs/links-and-embed", "/", "/f/not-a-real-form", "/nobody/nothing"];
  await hostPage(page, EMBEDDER, targets.map((path, i) => ({ id: `t${i}`, src: `${baseURL}${path}` })));
  const responses = new Map<string, Record<string, string>>();
  page.on("response", (res) => {
    if (res.request().frame() !== page.mainFrame() && res.request().isNavigationRequest()) responses.set(new URL(res.url()).pathname, res.headers());
  });
  await page.goto(`${EMBEDDER}/`);
  await page.waitForLoadState("networkidle");

  for (const [i, path] of targets.entries()) {
    await expect.poll(() => frameUrl(page, `t${i}`), { message: path }).not.toContain(new URL(baseURL!).host);
  }
  for (const [path, headers] of responses) {
    // Redirects (e.g. /dashboard → sign-in) are checked at their final page too.
    expect(headers["content-security-policy"] ?? "", path).toContain("frame-ancestors 'none'");
  }
});

test("a published form can be completed inside a frame on an allowed site only", async ({ page, browser, baseURL }) => {
  const shareId = process.env.E2E_EMBED_SHARE_ID;
  test.skip(!shareId, "Set E2E_EMBED_SHARE_ID to a published form that allows https://embedder.test (see the note at the top).");

  // Behave like a browser that blocks third-party cookies: nothing the frame requests carries one.
  await page.context().route((url) => !url.href.startsWith(EMBEDDER), (route) => {
    const headers = { ...route.request().headers() };
    delete headers.cookie;
    return route.continue({ headers });
  });
  await hostPage(page, EMBEDDER, [{ id: "form", src: `${baseURL}/f/${shareId}?embed=1` }, { id: "dash", src: `${baseURL}/dashboard` }]);
  await page.goto(`${EMBEDDER}/`);
  const form = page.frameLocator("iframe#form");
  const input = form.locator("input[type=text], textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  // Embed mode hides the site chrome.
  await expect(form.getByRole("link", { name: /chaos/i })).toHaveCount(0);
  // The auto-resize snippet receives the form's height.
  await expect.poll(() => page.evaluate(() => (window as unknown as { heights: number[] }).heights.length)).toBeGreaterThan(0);
  await input.fill("Embedded respondent");
  await form.getByRole("button", { name: /submit|send|next|continue/i }).last().click();
  await expect(form.getByText(/thank you|received/i).first()).toBeVisible({ timeout: 30_000 });
  // The creator dashboard still refuses the same host page.
  await expect.poll(() => frameUrl(page, "dash")).not.toContain(new URL(baseURL!).host);

  // Another site gets nothing.
  const other = await browser.newPage();
  await hostPage(other, OTHER_SITE, [{ id: "form", src: `${baseURL}/f/${shareId}?embed=1` }]);
  await other.goto(`${OTHER_SITE}/`);
  await expect.poll(() => frameUrl(other, "form")).not.toContain(new URL(baseURL!).host);
  await other.close();
});
