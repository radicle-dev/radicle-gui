import {
  test,
  expect,
  aliceRemote,
  bobRemote,
} from "@tests/support/fixtures.js";

test("user page", async ({ page }) => {
  await page.clock.setFixedTime(new Date("November 24 2022 12:00:00"));
  await page.goto(`/nodes/localhost/users/${aliceRemote}`, {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot();
});

test("empty pinned repos", async ({ page }) => {
  await page.goto(`/nodes/localhost/users/${bobRemote}`, {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot();
});

test("response parse error", async ({ page }) => {
  await page.route("*/**/v1/nodes/*", route => {
    return route.fulfill({
      json: [{ name: 1337 }],
    });
  });

  await page.goto(`/nodes/localhost/users/${bobRemote}`, {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot();
});

test("response error", async ({ page }) => {
  await page.route("*/**/v1/nodes/*", route => {
    return route.fulfill({
      status: 500,
    });
  });

  await page.goto(`/nodes/localhost/users/${bobRemote}`, {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot();
});
