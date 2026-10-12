import type { Page } from "@playwright/test";
import type { RadiclePeer } from "@tests/support/peerManager.js";

import * as Fs from "node:fs/promises";
import * as Path from "node:path";

import * as issue from "@tests/support/cobs/issue.js";
import { expect, reload, test } from "@tests/support/fixtures.js";
import { createRepo } from "@tests/support/repo.js";

async function createLinkedRepo(peer: RadiclePeer) {
  const { rid, repoFolder } = await createRepo(peer, { name: "links" });
  await Fs.mkdir(Path.join(repoFolder, "docs"));
  await Fs.writeFile(
    Path.join(repoFolder, "README.md"),
    [
      "# Links",
      "",
      "- [Relative guide](docs/guide.md)",
      "- [Rooted guide](/docs/guide.md)",
      "- [Missing file](docs/missing.md)",
      "- [Odd scheme](ftp://example.invalid/file)",
      "- [Website](https://example.invalid)",
      "- [Down below](#bottom)",
      "- [Down below, by file](README.md#Bottom)",
      "- [Guide details](docs/guide.md#Details)",
      "",
      ...Array.from({ length: 200 }, (_, i) => `Filler line ${i}.\n`),
      "## Bottom",
      "",
      "The end.",
      "",
    ].join("\n"),
  );
  await Fs.writeFile(
    Path.join(repoFolder, "docs", "guide.md"),
    [
      "# Guide",
      "",
      "Guide body.",
      "",
      "[Back to the readme](../README.md)",
      "",
      "[Repository root](/)",
      "",
      "[Spec](spec.adoc)",
      "",
      ...Array.from({ length: 200 }, (_, i) => `Guide filler ${i}.\n`),
      "## Details",
      "",
      "The details.",
      "",
    ].join("\n"),
  );
  await Fs.writeFile(
    Path.join(repoFolder, "docs", "spec.adoc"),
    [
      "= Spec",
      "",
      "Spec body.",
      "",
      "link:/README.md[Rooted readme]",
      "",
      "link:ftp://example.invalid/file[Odd scheme]",
      "",
    ].join("\n"),
  );
  await peer.git(["add", "."], { cwd: repoFolder });
  await peer.git(["commit", "-m", "Link the docs"], { cwd: repoFolder });
  await peer.git(["push", "rad", "main"], { cwd: repoFolder });
  return { rid, repoFolder };
}

// Following a link the app doesn't handle loads another page into the window,
// which restarts the app and drops this marker.
async function markWindow(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { linkMarker?: boolean }).linkMarker = true;
  });
}

async function expectSameWindow(page: Page) {
  expect(
    await page.evaluate(
      () => (window as unknown as { linkMarker?: boolean }).linkMarker,
    ),
  ).toBe(true);
}

test("follow relative links between Markdown files", async ({ page, peer }) => {
  const { rid } = await createLinkedRepo(peer);
  await page.goto(`/repos/${rid}/home`);
  await markWindow(page);

  const doc = page.locator(".markdown");
  await doc.getByRole("link", { name: "Relative guide" }).click();
  await expect(doc.getByText("Guide body.")).toBeVisible();
  await expect(page).toHaveURL(/\?path=docs(%2F|\/)guide\.md/);

  await doc.getByRole("link", { name: "Back to the readme" }).click();
  await expect(doc.getByText("The end.")).toBeVisible();
  await expect(page).toHaveURL(/\?path=README\.md/);

  await page.goBack();
  await expect(doc.getByText("Guide body.")).toBeVisible();
  await expectSameWindow(page);
});

test("follow links rooted at the repository", async ({ page, peer }) => {
  const { rid } = await createLinkedRepo(peer);
  await page.goto(`/repos/${rid}/home`);
  await markWindow(page);

  const doc = page.locator(".markdown");
  await doc.getByRole("link", { name: "Rooted guide" }).click();
  await expect(doc.getByText("Guide body.")).toBeVisible();

  await doc.getByRole("link", { name: "Repository root" }).click();
  await expect(doc.getByText("The end.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/home$`));
  await expectSameWindow(page);
});

test("show that a linked file is missing", async ({ page, peer }) => {
  const { rid } = await createLinkedRepo(peer);
  await page.goto(`/repos/${rid}/home`);
  await markWindow(page);

  await page
    .locator(".markdown")
    .getByRole("link", { name: "Missing file" })
    .click();
  await expect(page).toHaveURL(/\?path=docs(%2F|\/)missing\.md/);
  await expect(page.getByText(/does not exist/)).toBeVisible();
  // The readme the link was followed from isn't shown as the missing file.
  await expect(page.locator(".markdown")).toHaveCount(0);
  await expectSameWindow(page);
});

test("show a missing file in a repository without a readme", async ({
  page,
  peer,
}) => {
  const { rid, repoFolder } = await createRepo(peer, { name: "empty" });
  const issueId = await issue.create(
    peer,
    "Write the docs",
    "Start with the [guide](docs/guide.md).",
    [],
    { cwd: repoFolder },
  );
  await page.goto(`/repos/${rid}/issues/${issueId}`);

  await page
    .locator(".markdown")
    .getByRole("link", { name: "guide", exact: true })
    .click();
  await expect(page).toHaveURL(/\?path=docs(%2F|\/)guide\.md/);
  await expect(page.getByText(/does not exist/)).toBeVisible();
  await expect(page.getByText("No README.md")).toBeHidden();
});

test("explain a link the app can't open", async ({ page, peer }) => {
  const { rid } = await createLinkedRepo(peer);
  await page.goto(`/repos/${rid}/home`);
  await markWindow(page);
  const url = page.url();

  await page
    .locator(".markdown")
    .getByRole("link", { name: "Odd scheme" })
    .click();
  await expect(page.getByText("Can't open link")).toBeVisible();
  await expect(page.getByText("ftp://example.invalid/file")).toBeVisible();
  expect(page.url()).toBe(url);
  await expectSameWindow(page);
});

test("open external links outside the app", async ({ page, peer }) => {
  const { rid } = await createLinkedRepo(peer);
  await page.goto(`/repos/${rid}/home`);

  await expect(
    page.locator(".markdown").getByRole("link", { name: "Website" }),
  ).toHaveAttribute("target", "_blank");
});

test("scroll to a heading in the same document", async ({ page, peer }) => {
  const { rid } = await createLinkedRepo(peer);
  await page.goto(`/repos/${rid}/home`);
  await markWindow(page);
  const url = page.url();

  const doc = page.locator(".markdown");
  const heading = doc.getByRole("heading", { name: "Bottom" });
  await expect(heading).not.toBeInViewport();

  await doc.getByRole("link", { name: "Down below", exact: true }).click();
  await expect(heading).toBeInViewport();
  expect(page.url()).toBe(url);
  await expectSameWindow(page);

  await reload(page);
  await markWindow(page);
  await expect(heading).not.toBeInViewport();
  await doc.getByRole("link", { name: "Down below, by file" }).click();
  await expect(heading).toBeInViewport();
  expect(page.url()).toBe(url);
  await expectSameWindow(page);
});

test("open a file at the section a link points to", async ({ page, peer }) => {
  const { rid } = await createLinkedRepo(peer);
  await page.goto(`/repos/${rid}/home`);
  await markWindow(page);

  const doc = page.locator(".markdown");
  await doc.getByRole("link", { name: "Guide details" }).click();
  const heading = doc.getByRole("heading", { name: "Details" });
  await expect(heading).toBeInViewport();
  await expect(page).toHaveURL(/\?path=docs(%2F|\/)guide\.md#Details$/);

  await page.goBack();
  await expect(doc.getByText("The end.")).toBeVisible();
  await page.goForward();
  await expect(heading).toBeInViewport();
  await expectSameWindow(page);
});

test("follow links from AsciiDoc to Markdown", async ({ page, peer }) => {
  const { rid } = await createLinkedRepo(peer);
  await page.goto(`/repos/${rid}/home`);
  await markWindow(page);

  const doc = page.locator(".markdown");
  await doc.getByRole("link", { name: "Relative guide" }).click();
  await doc.getByRole("link", { name: "Spec" }).click();
  await expect(page.locator(".asciidoc").getByText("Spec body.")).toBeVisible();

  await page
    .locator(".asciidoc")
    .getByRole("link", { name: "Rooted readme" })
    .click();
  await expect(page.locator(".markdown").getByText("The end.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/home`));

  await page.goBack();
  await page
    .locator(".asciidoc")
    .getByRole("link", { name: "Odd scheme" })
    .click();
  await expect(page.getByText("Can't open link")).toBeVisible();
  await expectSameWindow(page);
});

test("open a file linked from an issue", async ({ page, peer }) => {
  const { rid, repoFolder } = await createLinkedRepo(peer);
  const issueId = await issue.create(
    peer,
    "Improve the docs",
    "The [guide](docs/guide.md) needs a section on links, next to its [details](docs/guide.md#details).",
    [],
    { cwd: repoFolder },
  );
  await page.goto(`/repos/${rid}/issues/${issueId}`);
  await markWindow(page);

  await page
    .locator(".markdown")
    .getByRole("link", { name: "guide", exact: true })
    .click();
  await expect(
    page.locator(".markdown").getByText("Guide body."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\?path=docs(%2F|\/)guide\.md/);
  await expectSameWindow(page);

  await page.goBack();
  await page
    .locator(".markdown")
    .getByRole("link", { name: "details", exact: true })
    .click();
  await expect(
    page.locator(".markdown").getByRole("heading", { name: "Details" }),
  ).toBeInViewport();
  await expectSameWindow(page);
});
