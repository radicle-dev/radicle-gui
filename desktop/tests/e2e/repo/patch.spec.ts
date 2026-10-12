import type { Page } from "@playwright/test";
import type { RadiclePeer } from "@tests/support/peerManager.js";

import * as Fs from "node:fs/promises";
import * as Path from "node:path";

import * as patch from "@tests/support/cobs/patch.js";
import { cobRid, expect, reload, test } from "@tests/support/fixtures.js";
import { createRepo } from "@tests/support/repo.js";

async function createPatch(peer: RadiclePeer) {
  const { rid, repoFolder } = await createRepo(peer, { name: "review" });
  const file = Path.join(repoFolder, "notes.txt");
  await Fs.writeFile(file, "one\ntwo\nthree\nfour\nfive\n");
  await peer.git(["add", "."], { cwd: repoFolder });
  await peer.git(["commit", "-m", "Add notes"], { cwd: repoFolder });
  await peer.git(["push", "rad", "main"], { cwd: repoFolder });
  const patchId = await patch.create(
    peer,
    ["Shout the third line"],
    "feature/shout",
    () => Fs.writeFile(file, "one\ntwo\nTHREE\nfour\nfive\n"),
    [],
    { cwd: repoFolder },
  );
  return { rid, patchId };
}

async function openChanges(page: Page, peer: RadiclePeer) {
  const { rid, patchId } = await createPatch(peer);
  await page.goto(`/repos/${rid}/patches/${patchId}?view=changes`);
}

// Opens the composer on a line of the new side, the way a reviewer does: by
// hovering the line number and pressing the marker Pierre puts in the gutter.
async function composeOnNewLine(page: Page, line: number, body: string) {
  await page
    .locator(
      `[data-unified] [data-column-number="${line}"]:not([data-line-type="change-deletion"])`,
    )
    .hover();
  await page.locator("[data-utility-button]").click();
  await page.getByPlaceholder("Leave a comment").fill(body);
}

function composer(page: Page) {
  return page
    .getByLabel("extended-textarea")
    .filter({ has: page.getByPlaceholder("Leave a comment") });
}

async function startReview(page: Page) {
  await composer(page)
    .getByRole("button", { name: /^Start review/ })
    .click();
}

async function justComment(page: Page) {
  await composer(page)
    .getByRole("button", { name: "icon-chevron-down" })
    .click();
  await page.getByRole("button", { name: /^Just comment Post/ }).click();
  await composer(page)
    .getByRole("button", { name: /^Just comment/ })
    .click();
}

test("a code comment keeps its line after a reload", async ({ page, peer }) => {
  await openChanges(page, peer);
  await composeOnNewLine(page, 3, "Why so loud?");
  await justComment(page);

  const thread = page.getByRole("group").filter({ hasText: "Why so loud?" });
  await thread.hover();
  await expect(thread.getByText("R3", { exact: true })).toBeVisible();

  await reload(page);
  await thread.hover();
  await expect(thread.getByText("R3", { exact: true })).toBeVisible();
});

test("a resolved review comment stays resolved", async ({ page, peer }) => {
  await openChanges(page, peer);
  await composeOnNewLine(page, 3, "Please lower the volume");
  await startReview(page);
  await page
    .getByRole("button", { name: "Accept revision", exact: true })
    .click();

  const thread = page
    .getByRole("group")
    .filter({ hasText: "Please lower the volume" });
  await thread.hover();
  await thread.getByTitle("Mark as resolved").click();
  await expect(thread.getByTitle("Mark as unresolved")).toBeVisible();

  await reload(page);
  await thread.hover();
  await expect(thread.getByTitle("Mark as unresolved")).toBeVisible();
});

test("a draft review is published with its comments and verdict", async ({
  page,
  peer,
}) => {
  await openChanges(page, peer);
  await composeOnNewLine(page, 3, "Shouting is fine here");
  await startReview(page);

  const summary = page.getByPlaceholder("Add an optional review summary");
  const pending = page
    .getByRole("status")
    .filter({ has: page.getByRole("img", { name: "icon-comment" }) });
  await expect(summary).toBeVisible();

  // The draft lives in local storage until it is published.
  await reload(page);
  await expect(summary).toBeVisible();
  await pending.hover();
  await expect(page.getByText("notes.txt:R3")).toBeVisible();

  await summary.fill("Looks good to me");
  await page
    .getByRole("button", { name: "Accept revision", exact: true })
    .click();

  await expect(summary).toBeHidden();
  await expect(page.getByText("Looks good to me").first()).toBeVisible();
  await expect(
    page.getByText("Accepted", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Rejected", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Shouting is fine here").first()).toBeVisible();

  await reload(page);
  await expect(summary).toBeHidden();
});

test("a comment-only review needs a summary", async ({ page, peer }) => {
  await openChanges(page, peer);
  await composeOnNewLine(page, 3, "Just a thought");
  await startReview(page);

  await page
    .getByRole("button", { name: "Accept revision", exact: true })
    .locator("xpath=following::button[1]")
    .click();
  await page.getByRole("button", { name: /^Comment Leave feedback/ }).click();

  const publish = page.getByRole("button", { name: "Comment", exact: true });
  await expect(publish).toBeDisabled();
  await page.getByPlaceholder("Add a review summary").fill("Some notes");
  await expect(publish).toBeEnabled();
});

test("shows reviews from other peers", async ({ page }) => {
  await page.goto(`/repos/${cobRid}/patches`);
  await page.getByText("Taking another stab at the README").click();

  await expect(page.getByText("This looks better")).toBeVisible();
  await expect(page.getByText("No this doesn't look better")).toBeVisible();
});
