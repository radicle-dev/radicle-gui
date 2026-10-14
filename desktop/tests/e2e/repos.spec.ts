import { expect, test } from "@tests/support/fixtures.js";

test("navigate to repo issues", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByRole("link", { name: "cobs" }).click();
  await page.getByRole("link", { name: "Issues" }).click();
  await page.getByText("This title has **markdown**").click();
  await expect(page.getByRole("dialog", { name: "Issue" })).toBeVisible();

  await page.getByTitle("Open full page").click();
  await expect(page).toHaveURL(/\/issues\/[0-9a-f]{40}/);
});
