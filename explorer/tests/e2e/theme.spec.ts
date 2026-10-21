import { test, expect, sourceBrowsingUrl } from "@tests/support/fixtures.js";

const sourceBrowsingFixture = `${sourceBrowsingUrl}/tree/main/src/true.c`;

test("default theme", async ({ page }) => {
  await page.goto(sourceBrowsingFixture);

  {
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute(
      "data-codefont",
      "jetbrains",
    );
  }
});

test("theme persistence", async ({ page }) => {
  await page.goto(sourceBrowsingFixture);
  await expect(
    page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "source-browsing" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();

  await page.getByRole("button", { name: "Code Font System" }).click();
  await page.getByRole("button", { name: "Light Mode" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-codefont", "system");

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-codefont", "system");
});

test("change theme", async ({ page }) => {
  await page.goto(sourceBrowsingFixture);
  await expect(
    page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "source-browsing" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();

  await page.getByRole("button", { name: "Light Mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(248, 249, 250)",
  );
  // Source highlighting reacts to theme change.
  await expect(page.getByText("() {")).toHaveCSS("color", "rgb(11, 13, 18)");

  await page.getByRole("button", { name: "Dark Mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(0, 6, 15)",
  );
  // Source highlighting reacts to theme change.
  await expect(page.getByText("() {")).toHaveCSS("color", "rgb(255, 255, 255)");
});

test("change code font", async ({ page }) => {
  await page.goto(sourceBrowsingFixture);
  await expect(
    page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "source-browsing" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();

  await page.getByRole("button", { name: "Code Font System" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-codefont", "system");

  await page.getByRole("button", { name: "Code Font JetBrains Mono" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-codefont",
    "jetbrains",
  );
});
