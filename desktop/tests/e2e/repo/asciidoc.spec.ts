import { expect, test } from "@tests/support/fixtures.js";

test("render an AsciiDoc readme", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByRole("link", { name: "asciidoc" }).click();

  const readme = page.locator(".asciidoc");

  await expect(
    readme.getByRole("heading", { name: "AsciiDoc Fixture", level: 1 }),
  ).toBeVisible();
  await expect(readme.locator("code.language-rust")).toBeVisible();
  await expect(readme.locator("table.tableblock").first()).toBeVisible();
  await expect(readme.getByText("An admonition.")).toBeVisible();
  await expect(readme.getByText("A footnote.")).toBeVisible();
});

test("open a relative link in the source view", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByRole("link", { name: "asciidoc" }).click();

  const readme = page.locator(".asciidoc");
  await expect(readme.getByRole("link", { name: "the notes" })).toBeVisible();

  const url = page.url();
  await readme.getByRole("link", { name: "the notes" }).click();

  // The link opens the file in the source view rather than navigating the
  // window away, and the file it opened is part of the history.
  await expect(page.getByText("Notes from a sibling file.")).toBeVisible();
  expect(page.url()).not.toBe(url);

  await page.goBack();
  await expect(readme.getByText("Alpha section text.")).toBeVisible();
  expect(page.url()).toBe(url);
});

test("keep wide AsciiDoc table cells inside the viewport", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByRole("link", { name: "asciidoc" }).click();

  const readme = page.locator(".asciidoc");
  await expect(readme.locator("table.tableblock").nth(1)).toBeVisible();

  const overflow = await readme.evaluate(
    element => element.scrollWidth - element.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("resolve includes in an AsciiDoc readme", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByRole("link", { name: "asciidoc" }).click();

  const readme = page.locator(".asciidoc");

  await expect(readme.getByText("Alpha section text.")).toBeVisible();
  // Only the requested tag is included.
  await expect(readme.getByText("Beta section text.")).toHaveCount(0);
});

test("refuse remote includes without a request", async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).hostname === "example.invalid") {
      remoteRequests.push(request.url());
    }
  });

  await page.goto("/inbox");
  await page.getByRole("link", { name: "asciidoc" }).click();

  const readme = page.locator(".asciidoc");
  await expect(
    readme.getByText(/Unresolved directive.*example\.invalid/),
  ).toBeVisible();
  expect(remoteRequests).toEqual([]);
});

test("bound the reads of recursive includes", async ({ page }) => {
  let blobReads = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/repo_blob") {
      blobReads += 1;
    }
  });

  await page.goto("/inbox");
  await page.getByRole("link", { name: "asciidoc" }).click();
  await page.getByText("bomb.adoc", { exact: true }).click();

  await expect(
    page
      .locator(".asciidoc")
      .getByRole("heading", { name: "Include Bomb", level: 1 }),
  ).toBeVisible({ timeout: 30_000 });
  // The include budget is 256 reads, plus the reads for the file itself and
  // the readme's own include.
  expect(blobReads).toBeLessThanOrEqual(260);
});

test("go back from a file opened in the tree", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByRole("link", { name: "asciidoc" }).click();

  const readme = page.locator(".asciidoc");
  await expect(readme.getByText("Alpha section text.")).toBeVisible();
  const url = page.url();

  await page.getByText("notes.txt", { exact: true }).click();
  await expect(page.getByText("Notes from a sibling file.")).toBeVisible();
  await expect(page).toHaveURL(/\?path=notes\.txt/);

  await page.goBack();
  await expect(readme.getByText("Alpha section text.")).toBeVisible();
  expect(page.url()).toBe(url);
});

test("show the same path at another revision", async ({ page }) => {
  await page.goto("/inbox");
  const commit = page.waitForResponse(
    response => new URL(response.url()).pathname === "/repo_commit",
  );
  await page.getByRole("link", { name: "asciidoc" }).click();
  const { parents } = (await (await commit).json()) as { parents: string[] };
  const rid = page.url().match(/\/repos\/(rad:[^/?]+)/)?.[1];

  await page.getByText("notes.txt", { exact: true }).click();
  await expect(page.getByText("Notes from a sibling file.")).toBeVisible();

  // Follow an in-app link to the same file at the previous commit, so the
  // view is reused with only the revision changed.
  await page.evaluate(href => {
    const anchor = document.createElement("a");
    anchor.href = href;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, `/repos/${rid}/home/${parents[0]}?path=notes.txt`);

  await expect(
    page.getByText("An earlier version of the notes."),
  ).toBeVisible();
  await expect(page.getByText("Notes from a sibling file.")).toHaveCount(0);

  await page.goBack();
  await expect(page.getByText("Notes from a sibling file.")).toBeVisible();
});

test("sanitize untrusted markup in an AsciiDoc readme", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByRole("link", { name: "asciidoc" }).click();

  const readme = page.locator(".asciidoc");
  await expect(readme.getByText("Untrusted markup")).toBeVisible();

  await expect(readme.locator("script")).toHaveCount(0);
  await expect(readme.locator("iframe")).toHaveCount(0);
  await expect(readme.locator("[onerror]")).toHaveCount(0);
  await expect(readme.locator("[onclick]")).toHaveCount(0);
  await expect(readme.locator('a[href^="javascript:"]')).toHaveCount(0);

  const marker = await page.evaluate(
    () => (window as unknown as { xssMarker?: string }).xssMarker,
  );
  expect(marker).toBeUndefined();
});
