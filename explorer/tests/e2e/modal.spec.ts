import { test, expect } from "@tests/support/fixtures.js";

test("open and close modal", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").press(`?`);
  await expect(
    page.locator(".modal").getByText("Keyboard shortcuts"),
  ).toBeVisible();

  // Close modal by pressing the `Esc` key.
  await page.locator("body").press("Escape");
  await expect(
    page.locator(".modal").getByText("Keyboard shortcuts"),
  ).not.toBeVisible();

  await page.locator("body").press(`?`);
  await expect(
    page.locator(".modal").getByText("Keyboard shortcuts"),
  ).toBeVisible();

  // Close modal by clicking outside of it.
  await page.locator(".overlay").click({ position: { x: 10, y: 10 } });
  await expect(
    page.locator(".modal").getByText("Keyboard shortcuts"),
  ).not.toBeVisible();
});
