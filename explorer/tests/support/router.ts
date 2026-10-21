import type { Page } from "@playwright/test";
import { expect } from "@tests/support/fixtures.js";

// Reloads the current page and verifies that the URL stays correct
export const expectUrlPersistsReload = async (page: Page) => {
  const url = page.url();
  await page.reload();
  await page
    .getByRole("progressbar", { name: "App loading" })
    .waitFor({ state: "hidden" });
  await expect(page).toHaveURL(url);
};

// Navigates back, checks the URL and navigates forward back to the initial page
export const expectBackAndForwardNavigationWorks = async (
  beforeURL: string,
  page: Page,
) => {
  const currentURL = page.url();

  await page.goBack();
  await page
    .getByRole("progressbar", { name: "Page loading" })
    .waitFor({ state: "hidden" });
  await expect(page).toHaveURL(beforeURL);
  await page.goForward();

  await page
    .getByRole("progressbar", { name: "Page loading" })
    .waitFor({ state: "hidden" });
  await expect(page).toHaveURL(currentURL);
};
