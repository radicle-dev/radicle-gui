import type { Page } from "@playwright/test";

import { expect, reload, test } from "@tests/support/fixtures.js";

function backButton(page: Page) {
  return page.getByRole("button", { name: "Back", exact: true });
}

function forwardButton(page: Page) {
  return page.getByRole("button", { name: "Forward", exact: true });
}

async function expectInbox(page: Page) {
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByRole("link", { name: "Issues" })).toBeHidden();
}

async function expectRepo(page: Page) {
  await expect(page).toHaveURL(/\/repos\/rad:[^/]+\/home$/);
  await expect(page.getByRole("link", { name: "Issues" })).toBeVisible();
}

async function expectIssues(page: Page) {
  await expect(page).toHaveURL(/\/issues/);
  await expect(page.getByText("This title has **markdown**")).toBeVisible();
}

async function openRepo(page: Page) {
  await page.getByRole("link", { name: "cobs" }).click();
  await expectRepo(page);
}

async function openIssues(page: Page) {
  await page.getByRole("link", { name: "Issues" }).click();
  await expectIssues(page);
}

async function launch(page: Page) {
  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: "cobs" })).toBeVisible();
}

test("back and forward are disabled on launch", async ({ page }) => {
  await launch(page);
  await expect(backButton(page)).toBeDisabled();
  await expect(forwardButton(page)).toBeDisabled();
});

test("back and forward follow the history", async ({ page }) => {
  await launch(page);
  await openRepo(page);
  await expect(backButton(page)).toBeEnabled();
  await expect(forwardButton(page)).toBeDisabled();

  await backButton(page).click();
  await expectInbox(page);
  await expect(backButton(page)).toBeDisabled();
  await expect(forwardButton(page)).toBeEnabled();

  await forwardButton(page).click();
  await expectRepo(page);
  await expect(backButton(page)).toBeEnabled();
  await expect(forwardButton(page)).toBeDisabled();
});

test("navigating after going back discards forward entries", async ({
  page,
}) => {
  await launch(page);
  await openRepo(page);
  await openIssues(page);
  await backButton(page).click();
  await expectRepo(page);
  await backButton(page).click();
  await expectInbox(page);
  await expect(forwardButton(page)).toBeEnabled();

  await openRepo(page);
  await expect(backButton(page)).toBeEnabled();
  await expect(forwardButton(page)).toBeDisabled();
});

test("history position survives a reload", async ({ page }) => {
  await launch(page);
  await openRepo(page);
  await page.waitForLoadState("networkidle");

  await reload(page);
  await expectRepo(page);
  await expect(backButton(page)).toBeEnabled();

  await backButton(page).click();
  await expectInbox(page);
  await expect(backButton(page)).toBeDisabled();
});

test("shortcuts stay within the app's history", async ({ page }) => {
  await launch(page);
  const mac = process.platform === "darwin";
  const backShortcut = mac ? "Meta+BracketLeft" : "Alt+ArrowLeft";
  const forwardShortcut = mac ? "Meta+BracketRight" : "Alt+ArrowRight";
  await openRepo(page);

  await page.keyboard.press(backShortcut);
  await expectInbox(page);

  await page.keyboard.press(backShortcut);
  await page.keyboard.press(forwardShortcut);
  await expectRepo(page);
});
