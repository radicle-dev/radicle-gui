import {
  aliceRemote,
  expect,
  sourceBrowsingUrl,
  test,
} from "@tests/support/fixtures.js";

test("source tree page", async ({ page }) => {
  await page.goto(sourceBrowsingUrl, { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot();
});

test("commits page", async ({ page }) => {
  await page.clock.setFixedTime(new Date("November 24 2022 12:00:00"));
  await page.goto(
    `${sourceBrowsingUrl}/remotes/${aliceRemote.substring(8)}/history`,
    {
      waitUntil: "networkidle",
    },
  );

  await expect(page).toHaveScreenshot({ fullPage: true });
});

test("commit page", async ({ page }) => {
  await page.clock.setFixedTime(new Date("November 24 2022 12:00:00"));
  await page.goto(
    `${sourceBrowsingUrl}/remotes/${aliceRemote.substring(
      8,
    )}/commits/1aded56c3ad55299df9f06c326af50b802a05949`,
  );
  await expect(page.getByText("subconscious.txt added")).toBeVisible();
  await expect(page).toHaveScreenshot({ fullPage: true });
});
