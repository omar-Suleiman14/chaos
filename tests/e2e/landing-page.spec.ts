import { test, expect } from "@playwright/test";

// Foundational browser smoke test wiring up Playwright end to end. The full
// authenticated creator + respondent flow is a separate, larger test owned
// by the "end-to-end production smoke test" issue later in this milestone.
test("landing page loads and offers sign-up for a signed-out visitor", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: /something people can use/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Get Chaos free/ }).first()).toBeVisible();
});

test("the footer links to the site map, which lists pages and guides", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Site map" }).click();
  await expect(page).toHaveURL(/\/sitemap$/);
  await expect(page.getByRole("heading", { level: 1, name: "Chaos site map" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pricing" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Documentation" })).toBeVisible();
});

test("Arabic marketing pages have their own address and stay Arabic", async ({ page }) => {
  await page.goto("/ar/sitemap");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1, name: "خريطة موقع Chaos" })).toBeVisible();
  // Opening /ar remembers Arabic, so the English address of a marketing page sends the reader back to /ar.
  await page.goto("/pricing");
  await expect(page).toHaveURL(/\/ar\/pricing$/);
});
