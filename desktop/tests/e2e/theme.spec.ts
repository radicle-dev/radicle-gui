import { expect, reload, test } from "@tests/support/fixtures.js";

test("default theme", async ({ page }) => {
  await page.goto("/inbox");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("theme persistence", async ({ page }) => {
  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: "markdown" })).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();

  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await reload(page);

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("change theme", async ({ page }) => {
  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: "markdown" })).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();

  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
