import { expect, type Page } from "@playwright/test";

// Shared by the E2E smoke and the browser journey benchmarks (perf/browser).
export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for E2E runs.`);
  }
  return value;
}

export function smokeEnvironment() {
  const baseURL = requiredEnv("PLAYWRIGHT_BASE_URL");
  const convexEnvironment = requiredEnv("E2E_CONVEX_ENV");
  const creatorEmail = requiredEnv("E2E_CREATOR_EMAIL");
  const creatorPassword = requiredEnv("E2E_CREATOR_PASSWORD");
  const allowProduction = process.env.E2E_ALLOW_PRODUCTION === "true";
  const hostname = new URL(baseURL).hostname.toLowerCase();

  if (!allowProduction && (hostname === "chaos.fail" || hostname.endsWith(".chaos.fail"))) {
    throw new Error(
      "Refusing to run the E2E smoke test against production Chaos hosts. Set E2E_ALLOW_PRODUCTION=true only for an intentional production run.",
    );
  }

  if (!allowProduction && /^(prod|production)$/i.test(convexEnvironment)) {
    throw new Error(
      "E2E_CONVEX_ENV must identify a dedicated non-production Convex environment.",
    );
  }

  return { baseURL, creatorEmail, creatorPassword };
}

export async function signInCreator(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Log in" }).click();

  const provider = process.env.E2E_AUTH_PROVIDER ?? "clerk";
  if (provider === "betterauth") {
    await page.getByRole("textbox", { name: /email/i }).fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    return;
  }
  if (provider !== "clerk") throw new Error("E2E_AUTH_PROVIDER must be clerk or betterauth");

  const identifier = page.locator('input[name="identifier"]');
  await expect(identifier).toBeVisible();
  await identifier.fill(email);
  await page.getByRole("button", { name: /continue/i }).click();

  const passwordInput = page.locator('input[name="password"]');
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(password);
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("link", { name: "Open Chaos" }).first()).toBeVisible();
}

export async function ensureCreatorUsername(page: Page, suffix: string) {
  const usernameHeading = page.getByRole("heading", { name: "CHOOSE YOUR USERNAME" });
  try {
    await usernameHeading.waitFor({ state: "visible", timeout: 3_000 });
  } catch {
    return;
  }

  await page.getByPlaceholder("E.G. BIOLOGY_NERD").fill(`e2e${suffix}`);
  await page.getByRole("button", { name: "SAVE & CONTINUE" }).click();
  await expect(usernameHeading).toBeHidden();
}
