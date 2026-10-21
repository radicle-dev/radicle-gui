import { test, expect } from "@tests/support/fixtures.js";

test("node page", async ({ page }) => {
  await page.clock.setFixedTime(new Date("November 24 2022 12:00:00"));
  await page.goto("/nodes/localhost", { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot();
});

test("empty pinned repos", async ({ page }) => {
  await page.route(
    ({ hostname, pathname }) =>
      pathname === "/api/v1/repos" && hostname === "127.0.0.1",
    async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        json: [],
      });
    },
  );
  await page.goto("/", {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot();
});

test("node not found", async ({ page }) => {
  await page.goto("/nodes/this.node.does.not.exist.xyz", {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot();
});

test("response parse error", async ({ page }) => {
  await page.route("*/**/v1/repos*", route => {
    return route.fulfill({
      json: [{ name: 1337 }],
    });
  });

  await page.goto("/nodes/localhost", {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot();
});

test("response error", async ({ page }) => {
  await page.route("*/**/v1/repos*", route => {
    return route.fulfill({
      status: 500,
    });
  });

  await page.goto("/nodes/localhost", {
    waitUntil: "networkidle",
  });
  await expect(page).toHaveScreenshot({
    mask: [page.locator(".command")],
  });
});
