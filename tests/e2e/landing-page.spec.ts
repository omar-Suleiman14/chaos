import { test, expect } from "@playwright/test";

// Foundational browser smoke test wiring up Playwright end to end. The full
// authenticated creator + respondent flow is a separate, larger test owned
// by the "end-to-end production smoke test" issue later in this milestone.
test("landing page loads and offers sign-up for a signed-out visitor", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "CHAOS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "START FREE" })).toBeVisible();
});
