import { test, expect, cobUrl } from "@tests/support/fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("November 24 2022 12:00:00"));
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
  ];

  for (const [name, status] of patches) {
    await page.goto(`${cobUrl}/patches?status=${status}`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("link", { name }).click();
    await page.getByRole("heading", { name }).waitFor();
    await expect(page).toHaveScreenshot({ fullPage: true });
  }
});
