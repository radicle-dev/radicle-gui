import { expect, test } from "@tests/support/fixtures.js";

const unreachableSeed = {
  hostname: "this.node.does.not.exist.xyz",
  port: 8081,
  scheme: "http",
};

test("explore repos page lists all repos and hides sort without a search backend", async ({
  page,
}) => {
  await page.goto("/explore/repos");

  // Breadcrumb and subtitle. Without a search backend the listing is forced
  // to "All repos" (rid order).
  await expect(page.getByRole("link", { name: "Explore" })).toBeVisible();
  await expect(page.getByText("All repos")).toBeVisible();

  // The repo grid renders the seeded repos.
  await expect(
    page.locator(".repo-card", { hasText: "source-browsing" }).first(),
  ).toBeVisible();

  // The sort control is only offered when the seed exposes a search backend.
  await expect(page.getByRole("button", { name: "Sort" })).toHaveCount(0);

  // The breadcrumb navigates back to the explore landing page.
  await page.getByRole("link", { name: "Explore" }).click();
  await expect(page).toHaveURL("/explore");
});

test("explore falls back to a healthy seed when the primary is unreachable", async ({
  page,
}) => {
  // Make an unreachable seed the primary, then fail its requests instantly.
  await page.addInitScript(seed => {
    window.localStorage.setItem("selectedSeed", JSON.stringify(seed));
  }, unreachableSeed);
  await page.route(
    url => url.hostname === unreachableSeed.hostname,
    route => route.abort(),
  );

  await page.goto("/explore", { waitUntil: "networkidle" });

  // Failover lands on the reachable preferred seed and the page renders its
  // repos, even though the configured primary seed is unreachable.
  await expect(page.getByText("source-browsing").first()).toBeVisible();
});

test("seed picker lives in the settings dropdown on explore", async ({
  page,
}) => {
  await page.goto("/explore", { waitUntil: "networkidle" });

  // The explore header no longer shows a seed picker directly.
  await expect(page.getByRole("button", { name: "Seed selector" })).toHaveCount(
    0,
  );

  // It's reached through the settings dropdown as the "Search seed" setting.
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Search seed")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Search seed selector" }),
  ).toContainText("localhost");
});

test("explore shows an error when no seed can be reached", async ({ page }) => {
  // Fail every request to the seed's httpd port so no candidate responds.
  await page.route(
    url => url.port === String(unreachableSeed.port),
    route => route.abort(),
  );

  await page.goto("/explore", { waitUntil: "networkidle" });

  await expect(page.getByText("Unable to reach any seed")).toBeVisible();
});
