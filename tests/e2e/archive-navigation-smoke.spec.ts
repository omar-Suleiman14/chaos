import { expect, test } from "@playwright/test";
import { signInCreator, smokeEnvironment } from "./support";

/** Reproduces the reported first-navigation 404 without needing to create data. */
test("creator can open Archive from the account menu and reload it", async ({ page }) => {
  test.setTimeout(90_000);
  const { creatorEmail, creatorPassword } = smokeEnvironment();
  await signInCreator(page, creatorEmail, creatorPassword);
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: /^(Account|الحساب)$/ })).toBeVisible();
  await page.getByRole("button", { name: /^(Account|الحساب)$/ }).click();
  await page.getByRole("menuitem", { name: /^(Archive|الأرشيف)$/ }).click();

  await expect(page).toHaveURL(/\/dashboard\/archive(?:[/?#]|$)/);
  await expect(page.getByRole("heading", { name: /^(Archive|الأرشيف)$/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^(Forms|النماذج)$/ })).toBeVisible();
  await expect(page.getByText(/Page not found|This page could not be found|No page available/i)).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: /^(Archive|الأرشيف)$/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^(Forms|النماذج)$/ })).toBeVisible();
});
