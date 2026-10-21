import { expect, sourceBrowsingRid, test } from "@tests/support/fixtures.js";

// The header repo-search only renders when the seed reports a search backend
// (`/info` → `searchAvailable`). Force it on and stub the search endpoint so
// we can drive the result-selection flow. The stubbed result points at the
// real `source-browsing` fixture repo so navigating to it actually loads.
// Force the header search bar on by reporting a search backend from `/info`.
// The search itself is served by httpd's real storage-walk fallback, so the
// results (and the seed they resolve on) are genuine — no stubbing the rid.
async function enableSearch(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/info", async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.httpd.searchAvailable = true;
    await route.fulfill({ response, json });
  });
}

test("selecting a search result with Enter navigates to the repo", async ({
  page,
}) => {
  await enableSearch(page);
  await page.goto("/explore");

  const input = page.getByRole("textbox", { name: "Search repositories" });
  await expect(input).toBeVisible();
  await input.fill("source");

  await expect(
    page.locator(".dropdown").getByRole("link", { name: /source-browsing/ }),
  ).toBeVisible();

  // Highlight the first result and confirm with Enter.
  await input.press("ArrowDown");
  await input.press("Enter");

  await expect(page).toHaveURL(new RegExp(sourceBrowsingRid));
  await expect(page.getByRole("button", { name: "Clone" })).toBeVisible();
});

test("clicking a search result navigates to the repo", async ({ page }) => {
  await enableSearch(page);
  await page.goto("/explore");

  const input = page.getByRole("textbox", { name: "Search repositories" });
  await expect(input).toBeVisible();
  await input.fill("source");

  await page
    .locator(".dropdown")
    .getByRole("link", { name: /source-browsing/ })
    .click();

  await expect(page).toHaveURL(new RegExp(sourceBrowsingRid));
  await expect(page.getByRole("button", { name: "Clone" })).toBeVisible();
});
