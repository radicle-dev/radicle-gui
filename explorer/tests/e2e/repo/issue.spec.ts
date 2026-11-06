import { test, cobUrl, expect } from "@tests/support/fixtures.js";

test("navigate single issue", async ({ page }) => {
  await page.goto(`${cobUrl}/issues`);
  await page.getByText("This title has **markdown**").click();

  await expect(page).toHaveURL(/\/issues\/[0-9a-f]{40}/);
});

test("open in app offers the download page", async ({ page }) => {
  await page.goto(`${cobUrl}/issues`);
  await page.getByText("This title has **markdown**").click();
  await page.getByRole("button", { name: "Share options" }).click();
  await page.getByText("Open in app").click();

  await expect(page.getByRole("status")).toContainText("Didn't open?");
  await page.getByRole("link", { name: "Get Radicle Desktop" }).click();
  await expect(page).toHaveURL(/\/desktop$/);
});
