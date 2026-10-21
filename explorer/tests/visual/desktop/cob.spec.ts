import { test, expect, cobUrl } from "@tests/support/fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("November 21 2022 12:00:00"));
});

test("issues page", async ({ page }) => {
  await page.goto(`${cobUrl}/issues`, { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot({ fullPage: true });

  await page.goto(`${cobUrl}/issues?status=closed`, {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot({ fullPage: true });
});

test("issue page", async ({ page }) => {
  const issues = [
    ["This title has **markdown**", "open"],
    ["A closed issue", "closed"],
    ["A solved issue", "closed"],
  ];
  for (const [name, status] of issues) {
    await page.goto(`${cobUrl}/issues?status=${status}`);
    await page.getByRole("link", { name }).click();
    await page.getByRole("heading", { name }).waitFor();
    await expect(page).toHaveScreenshot({ fullPage: true });
  }
});

test("patches page", async ({ page }) => {
  await page.goto(`${cobUrl}/patches`, {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot({ fullPage: true });
  await page.goto(`${cobUrl}/patches?status=draft`, {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot({ fullPage: true });
  await page.goto(`${cobUrl}/patches?status=archived`, {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot({ fullPage: true });
  await page.goto(`${cobUrl}/patches?status=merged`, {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot({ fullPage: true });
});

test("patch page", async ({ page }) => {
  const patches = [
    ["This patch is going to be reverted to draft", "draft"],
    ["This patch is going to be archived", "archived"],
    ["Let's add a README", "merged"],
    ["Add subtitle to README", "open"],
    ["Taking another stab at the README", "open"],
  ];

  for (const [name, status] of patches) {
    await page.goto(`${cobUrl}/patches?status=${status}`);
    await page.getByRole("link", { name }).click();
    await page.getByRole("heading", { name }).waitFor();
    await expect(page).toHaveScreenshot({ fullPage: true });
  }

  // Expand commit messages to check border line height
  await page.getByLabel("expand").nth(2).click();
  await expect(page).toHaveScreenshot({ fullPage: true });

  // Expand the commit message in the first revision
  await page.getByLabel("expand").first().click();
  await expect(page).toHaveScreenshot({ fullPage: true });
  await page.getByLabel("expand").nth(1).click();
  await expect(page).toHaveScreenshot({ fullPage: true });
  await page.getByRole("button", { name: "Changes" }).click();
  await page
    .getByText("1 file modified with 5 insertions and 1 deletion")
    .waitFor();
  await expect(page).toHaveScreenshot({ fullPage: true });
});

test("failed diff loading for a specific revision", async ({ page }) => {
  await page.route(
    ({ pathname }) =>
      pathname ===
      "/api/v1/repos/rad:z3fpY7nttPPa6MBnAv2DccHzQJnqe/diff/38c225e2a0b47ba59def211f4e4825c31d9463ec/9898da6155467adad511f63bf0fb5aa4156b92ef",
    route => route.fulfill({ status: 500 }),
  );

  await page.goto(`${cobUrl}/patches`);
  await page
    .getByRole("link", { name: "Taking another stab at the README" })
    .click();
  await page
    .getByRole("heading", { name: "Taking another stab at the README" })
    .waitFor();
  await expect(page).toHaveScreenshot({ fullPage: true });
});
