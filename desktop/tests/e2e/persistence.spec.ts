import { cobRid, expect, reload, test } from "@tests/support/fixtures.js";

test("a collapsed sidebar stays collapsed", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();

  await reload(page);
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();
});

test("a pinned repo stays pinned and first", async ({ page }) => {
  await page.goto("/inbox");
  const markdown = page.getByRole("link", { name: /markdown/ });
  await markdown.hover();
  await markdown.getByTitle("Pin repository").click();
  await expect(markdown.getByTitle("Unpin repository")).toBeAttached();

  await reload(page);
  await expect(markdown.getByTitle("Unpin repository")).toBeAttached();
  const repos = page.getByRole("link", { name: /Repository Avatar/ });
  await expect(repos.first()).toContainText("markdown");
});

test("a dismissed hint stays dismissed", async ({ page }) => {
  await page.goto(`/repos/${cobRid}/issues?status=all`);
  await page.getByText("This title has **markdown**").click();
  const hint = page.getByText("Markdown is supported");
  await expect(hint).toBeVisible();

  await page.getByTitle("Don't show again").click();
  await expect(hint).toBeHidden();
  await reload(page);
  await expect(page.getByPlaceholder("Leave a comment")).toBeVisible();
  await expect(hint).toBeHidden();
});

test("the split diff style is remembered", async ({ page }) => {
  await page.goto(`/repos/${cobRid}/patches`);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTitle("Split", { exact: true }).click();
  await page.keyboard.press("Escape");

  await reload(page);
  await page.getByText("Taking another stab at the README").click();
  await page.getByRole("button", { name: "icon-diff Changes" }).click();

  await expect(page.locator("[data-deletions]").first()).toBeAttached();
  await expect(page.locator("[data-unified]")).toHaveCount(0);
});

test("the revision sort order is remembered", async ({ page }) => {
  await page.goto(`/repos/${cobRid}/patches`);
  await page.getByText("Taking another stab at the README").click();
  await page.getByRole("button", { name: "icon-diff Changes" }).click();

  const picker = page.getByRole("button", { name: /Revision \d+ of 2/ });
  const sort = page.getByTitle(/^(Newest|Oldest) first$/);
  await picker.click();
  const before = await sort.getAttribute("title");
  await sort.click();
  const after = before === "Newest first" ? "Oldest first" : "Newest first";
  await expect(page.getByTitle(after, { exact: true })).toBeVisible();

  await reload(page);
  await picker.click();
  await expect(page.getByTitle(after, { exact: true })).toBeVisible();
});
