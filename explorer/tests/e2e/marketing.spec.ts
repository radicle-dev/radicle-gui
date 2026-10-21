import { expect, test } from "@tests/support/fixtures.js";

// The marketing site is only served when a deployment opts in via
// `homepage: "landing"`. Tests set it through the runtime config channel
// (`window.__CONFIG__`) before the app boots.
function enableLandingMode(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__CONFIG__ = {
      nodes: { homepage: "landing" },
    };
  });
}

test("landing page is served from / in landing mode", async ({ page }) => {
  await enableLandingMode(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(
    page.getByRole("heading", { name: /distributed code network/i }),
  ).toBeVisible();
  // The marketing sidebar navigation is present.
  await expect(page.getByRole("link", { name: "Install" })).toBeVisible();
});

test("marketing sub-routes resolve in landing mode", async ({ page }) => {
  await enableLandingMode(page);

  await page.goto("/install", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: /Get started with Radicle/i }),
  ).toBeVisible();

  // A markdown doc route renders its compiled content.
  await page.goto("/glossary", { waitUntil: "networkidle" });
  await expect(page.locator(".markdown-content")).toBeVisible();
});

test("mobile navigation menu links between marketing pages", async ({
  page,
}) => {
  await enableLandingMode(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  // The left sidebar is hidden on mobile; navigation happens through the
  // header's hamburger menu instead.
  const menuButton = page.getByRole("button", { name: "Open navigation menu" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
  await mobileNav.getByRole("link", { name: /Learn/ }).click();

  await expect(page).toHaveURL("/learn");
  await expect(
    page.getByRole("heading", { name: /Learn Radicle/i }),
  ).toBeVisible();
});

test("marketing routes are not found without landing mode", async ({
  page,
}) => {
  await page.goto("/install", { waitUntil: "networkidle" });
  await expect(page.getByText("Page not found")).toBeVisible();
});
