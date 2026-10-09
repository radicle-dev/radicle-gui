import { test, cobUrl, expect } from "@tests/support/fixtures.js";

test("navigate patch details", async ({ page }) => {
  await page.goto(`${cobUrl}/patches`);
  await page.getByText("Add subtitle to README").click();
  await expect(page).toHaveURL(/patches\/[a-f0-9]{40}$/);
  // The router pushes the URL before the patch view renders. Until it is up,
  // the link below resolves to the teaser on the patch listing, and clicking
  // that navigates to the patch we are already on.
  await page.getByRole("heading", { name: "Add subtitle to README" }).waitFor();
  await page.getByRole("link", { name: "Add subtitle to README" }).click();
  await expect(page).toHaveURL(/commits\/[a-f0-9]{40}$/);
  await page.goBack();
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "Changes" }).click();
  await expect(page).toHaveURL(/patches\/[a-f0-9]{40}\?tab=changes$/);
});

test("use revision selector", async ({ page }) => {
  await page.goto(`${cobUrl}/patches`);
  await page
    .getByRole("link", { name: "Taking another stab at the README" })
    .click();
  await page.getByRole("link", { name: "Changes" }).click();

  // Validating the latest revision state
  await expect(
    page.getByRole("cell", { name: "Had to push a new revision" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Activity" }).click();
  await expect(page.getByLabel("commit-teaser")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Add more text" })).toBeVisible();

  // Open the first revision and close the latest one
  await page.getByLabel("expand").first().click();
  await page.getByLabel("expand").last().click();

  // Validating the initial revision
  await expect(page.getByLabel("commit-teaser")).toHaveCount(3);
  await expect(
    page.getByRole("link", { name: "Rewrite subtitle to README" }).first(),
  ).toBeVisible();

  await page.getByRole("link", { name: "Changes" }).click();
  // Switching to the initial revision

  await page.getByRole("button", { name: "Revision" }).first().click();
  await page.getByRole("button", { name: "Revision" }).nth(1).click();

  await expect(
    page.getByRole("cell", { name: "Had to push a new revision" }),
  ).toBeHidden();

  await expect(page).toHaveURL(
    /patches\/[a-f0-9]{40}\/[a-f0-9]{40}\?tab=changes$/,
  );
});

test("navigate through revision diffs", async ({ page }) => {
  await page.goto(`${cobUrl}/patches`);
  await page
    .getByRole("link", { name: "Taking another stab at the README" })
    .click();

  const firstRevision = page.locator(".revision").first();
  const firstRevisionId = "59a0821";
  const secondRevision = page.locator(".revision").nth(1);

  // Second revision
  {
    await secondRevision
      .getByRole("button", { name: "toggle-context-menu" })
      .first()
      .click();
    await secondRevision
      .getByRole("link", { name: "Compare to base: 38c225e" })
      .click();
    await expect(
      page.getByRole("button", { name: "Compare 38c225..9e4fea" }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      /patches\/[a-f0-9]{40}\?diff=38c225e2a0b47ba59def211f4e4825c31d9463ec\.\.9e4feab1b2123dfa5f22bd0e4656060ec9296638$/,
    );
    await page.goBack();
    await page.waitForLoadState("networkidle");
    await secondRevision
      .getByRole("button", { name: "toggle-context-menu" })
      .first()
      .click();
    await secondRevision
      .getByRole("link", {
        name: `Compare to previous revision: ${firstRevisionId}`,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Compare 88b7fd..9e4fea" }),
    ).toBeVisible();

    await expect(page).toHaveURL(
      /patches\/[a-f0-9]{40}\?diff=88b7fd90389c1a629f91ed7bf838d4b947426622\.\.9e4feab1b2123dfa5f22bd0e4656060ec9296638$/,
    );
    await page.goBack();
    await page.waitForLoadState("networkidle");
  }
  // First revision and DiffStatBadge shortcut.
  {
    await firstRevision.getByTitle("Compare 38c225e..88b7fd9").click();
    await expect(
      page.getByRole("button", { name: "Compare 38c225..88b7fd" }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      /patches\/[a-f0-9]{40}\?diff=38c225e2a0b47ba59def211f4e4825c31d9463ec\.\.88b7fd90389c1a629f91ed7bf838d4b947426622$/,
    );
  }
});

test("view file navigation from changes tab", async ({ page }) => {
  await page.goto(`${cobUrl}/patches`);
  await page.getByRole("link", { name: "Add subtitle to README" }).click();
  await page.getByRole("link", { name: "Changes" }).click();
  await page.getByRole("button", { name: "Changes" }).click();
  await page.getByRole("button", { name: "View file at this commit" }).click();
  await expect(page).toHaveURL(
    `${cobUrl}/tree/8c900d6cb38811e099efb3cbbdbfaba817bcf970/README.md`,
  );
});

test("commit listing ordering keeping stable on browser navigation", async ({
  page,
}) => {
  await page.goto(`${cobUrl}/patches`);
  await page
    .getByRole("link", { name: "Taking another stab at the README" })
    .click();
  await page
    .getByRole("heading", { name: "Taking another stab at the README" })
    .waitFor();

  async function expectCorrectCommitListing() {
    const commits = await page.locator(".commit").all();
    expect(commits).toHaveLength(2);
    await expect(
      commits[0].getByText("Rewrite subtitle to README"),
    ).toBeVisible();
    await expect(commits[1].getByText("Add more text")).toBeVisible();
  }

  await expectCorrectCommitListing();
  await page.getByRole("link", { name: "Rewrite subtitle to README" }).click();
  await page.goBack();
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("heading", { name: "Taking another stab at the README" })
    .waitFor();
  await expectCorrectCommitListing();
});

test("link to a comment in an older revision", async ({ page }) => {
  await page.goto(`${cobUrl}/patches`);
  await page
    .getByRole("link", { name: "Taking another stab at the README" })
    .click();
  await page.getByLabel("expand").first().click();
  const review = page.locator(".card", { hasText: "accepted revision" });
  const reviewId = (await review.getAttribute("id")) ?? "";
  expect(reviewId).toMatch(/^[a-f0-9]{40}$/);
  const patchUrl = page.url();

  await page.goto(`${patchUrl}#${reviewId}`);
  await expect(review).toBeVisible();
  await expect(review).toHaveClass(/targeted/);
  await expect(review).toBeInViewport();

  await page.goto(patchUrl);
  await expect(review).toBeHidden();
  await page.evaluate(id => (window.location.hash = id), reviewId);
  await expect(review).toBeVisible();
  await expect(review).toHaveClass(/targeted/);
  await expect(review).toBeInViewport();
});

test("malformed fragment does not break the patch page", async ({ page }) => {
  await page.goto(`${cobUrl}/patches`);
  await page
    .getByRole("link", { name: "Taking another stab at the README" })
    .click();
  await page
    .getByRole("heading", { name: "Taking another stab at the README" })
    .waitFor();

  await page.goto(`${page.url()}#%`);
  await expect(
    page.getByRole("heading", { name: "Taking another stab at the README" }),
  ).toBeVisible();
  await expect(page.locator(".card.targeted")).toHaveCount(0);
});
