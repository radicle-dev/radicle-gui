import { test, expect } from "@tests/support/fixtures.js";

test("pinned repos", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "configuredPreferredSeeds",
      JSON.stringify([{ hostname: "127.0.0.1", port: 8081, scheme: "http" }]),
    );
  });

  await page.clock.setFixedTime(new Date("November 24 2022 12:00:00"));
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot();
});

test("load repos error", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "configuredPreferredSeeds",
      JSON.stringify([{ hostname: "127.0.0.1", port: 8081, scheme: "http" }]),
    );
  });

  await page.clock.setFixedTime(new Date("November 24 2022 12:00:00"));
  await page.route(
    ({ pathname }) => pathname === "/api/v1/repos",
    route => route.fulfill({ status: 500 }),
  );

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot({
    mask: [page.locator(".command")],
  });
});

test("response parse error", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "configuredPreferredSeeds",
      JSON.stringify([{ hostname: "127.0.0.1", port: 8081, scheme: "http" }]),
    );
  });
  await page.route("*/**/v1/repos*", route => {
    return route.fulfill({
      json: [{ name: 1337 }],
    });
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot();
});

test("response error", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "configuredPreferredSeeds",
      JSON.stringify([{ hostname: "127.0.0.1", port: 8081, scheme: "http" }]),
    );
  });
  await page.route("*/**/v1/repos*", route => {
    return route.fulfill({
      status: 500,
      body: "There is an error in the response",
    });
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot({
    mask: [page.locator(".command")],
  });
});

test("unable to reach any seed", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "configuredPreferredSeeds",
      JSON.stringify([{ hostname: "127.0.0.1", port: 8081, scheme: "http" }]),
    );
  });
  // Fail every seed request so no candidate responds, exercising the
  // failover dead-end on the explore page.
  await page.route(
    url => url.port === "8081",
    route => route.abort(),
  );
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot();
});
