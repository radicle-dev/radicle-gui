import { expect, test } from "@tests/support/fixtures.js";

test("page not found", async ({ page }) => {
  await page.goto("/this/page/does/not/exist", {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot();
});
