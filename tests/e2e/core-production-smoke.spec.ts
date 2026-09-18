import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the core E2E smoke test.`);
  }
  return value;
}

function smokeEnvironment() {
  const baseURL = requiredEnv("PLAYWRIGHT_BASE_URL");
  const convexEnvironment = requiredEnv("E2E_CONVEX_ENV");
  const creatorEmail = requiredEnv("E2E_CREATOR_EMAIL");
  const creatorPassword = requiredEnv("E2E_CREATOR_PASSWORD");
  const allowProduction = process.env.E2E_ALLOW_PRODUCTION === "true";
  const hostname = new URL(baseURL).hostname.toLowerCase();

  if (!allowProduction && (hostname === "chaos.fail" || hostname === "www.chaos.fail")) {
    throw new Error(
      "Refusing to run the E2E smoke test against chaos.fail. Set E2E_ALLOW_PRODUCTION=true only for an intentional production run.",
    );
  }

  if (!allowProduction && /^(prod|production)$/i.test(convexEnvironment)) {
    throw new Error(
      "E2E_CONVEX_ENV must identify a dedicated non-production Convex environment.",
    );
  }

  return { baseURL, creatorEmail, creatorPassword };
}

async function signInWithClerk(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "LOG IN" }).click();

  const identifier = page.locator('input[name="identifier"]');
  await expect(identifier).toBeVisible();
  await identifier.fill(email);
  await page.getByRole("button", { name: /continue/i }).click();

  const passwordInput = page.locator('input[name="password"]');
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(password);
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("link", { name: "ENTER DASHBOARD" })).toBeVisible();
}

async function ensureCreatorUsername(page: Page, suffix: string) {
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

async function openQuizMenu(page: Page, quizRow: Locator) {
  const livePageLink = page.getByRole("link", { name: "Open Live Page" });
  if (!(await livePageLink.isVisible())) {
    await quizRow.getByRole("button").last().click();
  }
  await expect(livePageLink).toBeVisible();
}

test("creator to respondent production smoke", async ({ page, browser }) => {
  test.setTimeout(120_000);

  const { baseURL, creatorEmail, creatorPassword } = smokeEnvironment();
  const suffix = `${Date.now()}`.slice(-10);
  const quizTitle = `E2E Smoke ${suffix}`;
  const editedQuizTitle = `${quizTitle} Revised`;
  const quizSlug = `e2e-smoke-${suffix}`;
  const questionText = `Smoke question ${suffix}?`;
  const correctAnswer = `Correct ${suffix}`;
  const wrongAnswer = `Wrong ${suffix}`;
  const respondentName = `Respondent ${suffix}`;

  await signInWithClerk(page, creatorEmail, creatorPassword);
  await page.goto("/dashboard");
  await ensureCreatorUsername(page, suffix);

  await page.getByRole("button", { name: /NEW QUIZ|START CREATING/ }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/editor\?id=/);

  await page.getByPlaceholder("GIVE YOUR QUIZ A NAME...").fill(quizTitle);
  await page.getByPlaceholder("MY-QUIZ").fill(quizSlug);
  await page.getByRole("button", { name: "Randomize Question Order" }).click();

  await page.getByRole("button", { name: "ADD QUESTION" }).click();
  await page.getByPlaceholder("TYPE YOUR QUESTION HERE...").fill(questionText);
  await page.getByPlaceholder("Option A...").fill(correctAnswer);
  await page.getByPlaceholder("Option B...").fill(wrongAnswer);
  await page.getByTitle("Set as correct answer").first().click();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);

  const quizTitleText = page.getByText(quizTitle, { exact: true });
  await expect(quizTitleText).toBeVisible();
  const quizRow = quizTitleText.locator("xpath=ancestor::div[contains(@class,'group')][1]");

  if (await quizRow.getByText("LIVE", { exact: true }).isVisible()) {
    await openQuizMenu(page, quizRow);
    await page.getByRole("button", { name: "Unpublish" }).click();
    await expect(quizRow.getByText("DRAFT", { exact: true })).toBeVisible();
  }

  await openQuizMenu(page, quizRow);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(quizRow.getByText("LIVE", { exact: true })).toBeVisible();

  await openQuizMenu(page, quizRow);
  const publicHref = await page.getByRole("link", { name: "Open Live Page" }).getAttribute("href");
  expect(publicHref).toBeTruthy();
  const publicURL = new URL(publicHref!, baseURL).toString();

  const respondentContext = await browser.newContext({ baseURL });
  const respondentPage = await respondentContext.newPage();
  try {
    await respondentPage.goto(publicURL);
    await respondentPage.getByPlaceholder("ENTER YOUR NAME").fill(respondentName);
    await respondentPage.getByRole("button", { name: /START QUIZ/ }).click();

    await expect(respondentPage.getByText(questionText, { exact: true })).toBeVisible();
    await respondentPage.getByRole("button", { name: new RegExp(correctAnswer) }).click();
    await expect(respondentPage.getByText(/CORRECT/, { exact: false })).toBeVisible();
    await respondentPage.getByText("SWIPE UP TO FINISH", { exact: true }).click();

    const submitQuiz = respondentPage.getByRole("button", { name: /SUBMIT QUIZ/ });
    await expect(submitQuiz).toBeVisible();
    await submitQuiz.click();
    await expect(respondentPage.getByText("YOUR SCORE", { exact: true })).toBeVisible();
    await expect(respondentPage.getByText("100%", { exact: true })).toBeVisible();
  } finally {
    await respondentContext.close();
  }

  await page.goto("/dashboard/results");
  await page.getByRole("link", { name: quizTitle, exact: true }).click();
  await expect(page.getByRole("heading", { name: quizTitle, exact: true })).toBeVisible();
  await expect(page.getByText(respondentName, { exact: true })).toBeVisible();

  const submissionsCard = page.getByText("TOTAL SUBMISSIONS", { exact: true }).locator("..");
  await expect(submissionsCard.getByText("1", { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT TO EXCEL" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const csv = await readFile(downloadPath!, "utf8");
  expect(csv).toContain(respondentName);

  await page.getByRole("link", { name: "EDIT SETTINGS" }).click();
  await page.getByPlaceholder("GIVE YOUR QUIZ A NAME...").fill(editedQuizTitle);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.getByText(editedQuizTitle, { exact: true })).toBeVisible();
});
