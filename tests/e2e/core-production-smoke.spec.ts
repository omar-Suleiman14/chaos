import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { ensureCreatorUsername, signInCreator, smokeEnvironment } from "./support";

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

  await signInCreator(page, creatorEmail, creatorPassword);
  await page.goto("/dashboard");
  await ensureCreatorUsername(page, suffix);

  await page.getByRole("button", { name: /new quiz|start creating/i }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/editor\?id=/);

  await page.getByPlaceholder("Give your quiz a name...").fill(quizTitle);
  await page.getByPlaceholder("my-quiz").fill(quizSlug);
  await page.getByRole("switch", { name: /randomize question order/i }).click();

  await page.getByRole("button", { name: "Multiple choice", exact: true }).click();
  await page.getByPlaceholder("Type your question here...").fill(questionText);
  await page.getByPlaceholder("Option A...").fill(correctAnswer);
  await page.getByPlaceholder("Option B...").fill(wrongAnswer);
  await page.getByRole("button", { name: "Mark option A correct" }).click();

  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);

  const quizTitleText = page.getByText(quizTitle, { exact: true });
  await expect(quizTitleText).toBeVisible();
  const quizRow = quizTitleText.locator("xpath=ancestor::div[contains(@class,'group')][1]");

  if (await quizRow.getByText("Live", { exact: true }).isVisible()) {
    await openQuizMenu(page, quizRow);
    await page.getByRole("button", { name: "Unpublish" }).click();
    await expect(quizRow.getByText("Draft", { exact: true })).toBeVisible();
  }

  await openQuizMenu(page, quizRow);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(quizRow.getByText("Live", { exact: true })).toBeVisible();

  await openQuizMenu(page, quizRow);
  const publicHref = await page.getByRole("link", { name: "Open Live Page" }).getAttribute("href");
  expect(publicHref).toBeTruthy();
  const publicURL = new URL(publicHref!, baseURL).toString();

  const respondentContext = await browser.newContext({ baseURL });
  const respondentPage = await respondentContext.newPage();
  try {
    await respondentPage.goto(publicURL);
    await respondentPage.getByPlaceholder("Your name").fill(respondentName);
    await respondentPage.getByRole("button", { name: /Start quiz/ }).click();

    await expect(respondentPage.getByText(questionText, { exact: true })).toBeVisible();
    await respondentPage.getByRole("button", { name: new RegExp(correctAnswer) }).click();
    await expect(respondentPage.getByText(/^(Correct|Partly correct|Not quite)$/)).toBeVisible();
    await respondentPage.getByText("SWIPE UP TO FINISH", { exact: true }).click();

    const submitQuiz = respondentPage.getByRole("button", { name: /Submit quiz/ });
    await expect(submitQuiz).toBeVisible();
    await submitQuiz.click();
    await expect(respondentPage.getByText("Your score", { exact: true })).toBeVisible();
    await expect(respondentPage.getByText("100%", { exact: true })).toBeVisible();
  } finally {
    await respondentContext.close();
  }

  await page.goto("/dashboard/results");
  await page.getByRole("link", { name: quizTitle, exact: true }).click();
  await expect(page.getByRole("heading", { name: quizTitle, exact: true })).toBeVisible();
  await expect(page.getByText(respondentName, { exact: true })).toBeVisible();

  const submissionsCard = page.getByText("Total submissions", { exact: true }).locator("..");
  await expect(submissionsCard.getByText("1", { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const csv = await readFile(downloadPath!, "utf8");
  expect(csv).toContain(respondentName);

  await page.getByRole("link", { name: "Edit settings" }).click();
  await page.getByPlaceholder("Give your quiz a name...").fill(editedQuizTitle);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.getByText(editedQuizTitle, { exact: true })).toBeVisible();
});
