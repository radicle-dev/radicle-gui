import type { Page } from "@playwright/test";
import type { RadiclePeer } from "@tests/support/peerManager.js";

import { createProject } from "@tests/support/collaboration.js";
import {
  expect,
  reload,
  test,
  waitForCommand,
} from "@tests/support/fixtures.js";

async function openPatch(page: Page, peer: RadiclePeer) {
  const { rid, patchId } = await createProject(peer);
  await page.goto(`/repos/${rid}/patches/${patchId}`);
  await expect(
    page.getByRole("button", { name: "Shout the third line" }),
  ).toBeVisible();
  return { rid, patchId };
}

test("a patch can be labelled", async ({ page, peer }) => {
  await openPatch(page, peer);

  await page.getByRole("button", { name: "Add labels" }).click();
  await page.getByPlaceholder("Add label").fill("needs-review");
  await waitForCommand(page, "edit_patch", () =>
    page.getByPlaceholder("Add label").press("Enter"),
  );
  const label = page.getByRole("button", { name: "needs-review" });
  await expect(label).toBeVisible();

  await reload(page);
  await expect(label).toBeVisible();
});

test("a patch can be archived, drafted and reopened", async ({
  page,
  peer,
}) => {
  await openPatch(page, peer);

  const state = (name: string) =>
    page.getByRole("button", { name: new RegExp(`${name} icon-chevron`) });

  await state("Open").click();
  await page.getByRole("button", { name: /Archived$/ }).click();
  await expect(state("Archived")).toBeVisible();
  await reload(page);
  await expect(state("Archived")).toBeVisible();

  await state("Archived").click();
  await page.getByRole("button", { name: /Draft$/ }).click();
  await expect(state("Draft")).toBeVisible();

  await state("Draft").click();
  await page.getByRole("button", { name: /Open$/ }).click();
  await expect(state("Open")).toBeVisible();
  await reload(page);
  await expect(state("Open")).toBeVisible();
});

test("a patch can be deleted", async ({ page, peer }) => {
  const { rid } = await openPatch(page, peer);

  await page.getByTitle("Delete patch from your node").click();
  await page
    .getByRole("button", { name: "icon-trash Delete", exact: true })
    .last()
    .click();

  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/patches`));
  // The list renders with its items, so once its filters show it's loaded.
  await expect(page.getByRole("link", { name: /Merged/ })).toBeVisible();
  await expect(page.getByText("Shout the third line")).toBeHidden();
});

// Items in the menu behind a comment's "Comment actions" button.
async function commentAction(page: Page, body: string, action: string) {
  await page.getByText(body).hover();
  const toggle = page.getByTitle("Comment actions").last();
  await toggle.click();
  await toggle
    .locator(
      `xpath=following::*[@role="button"][normalize-space()="${action}"][1]`,
    )
    .click();
}

test("the title and description can be edited", async ({ page, peer }) => {
  const { rid, patchId } = await openPatch(page, peer);

  await page.getByRole("button", { name: "Shout the third line" }).click();
  const input = page.locator("input:focus");
  await input.fill("Shout the third line louder");
  await waitForCommand(page, "edit_patch", () => input.press("Enter"));
  const title = page.getByRole("button", {
    name: "Shout the third line louder",
  });
  await expect(title).toBeVisible();

  await page.goto(`/repos/${rid}/patches/${patchId}?view=changes`);
  await page.getByText("Readers skim").hover();
  await page.getByTitle("Edit description").click();
  const editor = page.getByRole("textbox", { name: "textarea-comment" });
  await editor.fill("Readers skim, so make it loud.");
  await waitForCommand(page, "edit_patch", () =>
    page.getByRole("button", { name: /^Save/ }).click(),
  );
  await expect(page.getByText("Readers skim, so make it loud.")).toBeVisible();

  await reload(page);
  await expect(title).toBeVisible();
  await expect(page.getByText("Readers skim, so make it loud.")).toBeVisible();
});

test("a patch comment can be edited and deleted", async ({ page, peer }) => {
  await openPatch(page, peer);

  await page.getByPlaceholder("Leave a comment").fill("Needs more shouting");
  await page.getByRole("button", { name: /^Comment/ }).click();
  await expect(page.getByText("Needs more shouting")).toBeVisible();

  await commentAction(page, "Needs more shouting", "Edit");
  await page
    .getByPlaceholder("Leave a comment")
    .first()
    .fill("Needs less shouting");
  await waitForCommand(page, "edit_patch", () =>
    page.getByRole("button", { name: /^Save/ }).click(),
  );
  await reload(page);
  await expect(page.getByText("Needs less shouting")).toBeVisible();

  await waitForCommand(page, "edit_patch", () =>
    commentAction(page, "Needs less shouting", "Delete"),
  );
  await reload(page);
  await expect(page.getByText("Needs less shouting")).toBeHidden();
});

test("an assignee can be added to a patch", async ({ page, peer }) => {
  await openPatch(page, peer);

  await page.getByRole("button", { name: "Add assignees" }).click();
  const input = page.getByPlaceholder(/^Alias or DID/);
  await input.fill(peer.nodeId);
  await waitForCommand(page, "edit_patch", () => input.press("Enter"));

  await reload(page);
  await expect(
    page.getByRole("button", {
      name: "icon-avatar-incognito Assignees",
      exact: true,
    }),
  ).toBeVisible();
});

test("a reaction can be added to a patch comment", async ({ page, peer }) => {
  await openPatch(page, peer);
  await page.getByPlaceholder("Leave a comment").fill("Loud and clear");
  await page.getByRole("button", { name: /^Comment/ }).click();

  await page.getByText("Loud and clear").hover();
  await page.getByTitle("React").last().click();
  await waitForCommand(page, "edit_patch", () =>
    page.getByRole("button", { name: "👍" }).click(),
  );
  await reload(page);
  await expect(page.getByTitle("Remove reaction")).toBeVisible();
});

test("a published review's verdict and summary can be changed", async ({
  page,
  peer,
}) => {
  const { rid, patchId } = await createProject(peer);
  await page.goto(`/repos/${rid}/patches/${patchId}?view=changes`);
  // Only reviews with code comments get a page of their own.
  await page
    .locator(
      '[data-unified] [data-column-number="3"]:not([data-line-type="change-deletion"])',
    )
    .hover();
  await page.locator("[data-utility-button]").click();
  await page.getByPlaceholder("Leave a comment").fill("Loud enough");
  await page
    .getByLabel("extended-textarea")
    .filter({ has: page.getByPlaceholder("Leave a comment") })
    .getByRole("button", { name: /^Start review/ })
    .click();
  await page
    .getByPlaceholder("Add an optional review summary")
    .fill("Looks fine");
  await waitForCommand(page, "create_patch_review", () =>
    page.getByRole("button", { name: "Accept revision", exact: true }).click(),
  );
  // Publishing opens the review's own page.

  await page.getByRole("button", { name: /Accepted/ }).click();
  await waitForCommand(page, "edit_patch", () =>
    page.getByRole("button", { name: /Reject$/ }).click(),
  );
  const rejected = page.getByRole("button", { name: /Rejected/ });
  await expect(rejected).toBeVisible();

  await page.getByText("Looks fine").hover();
  await page.getByTitle("Edit summary").click();
  await page
    .getByRole("textbox", { name: "textarea-comment" })
    .first()
    .fill("Too loud");
  await waitForCommand(page, "edit_patch", () =>
    page.getByRole("button", { name: /^Save/ }).click(),
  );

  await reload(page);
  await expect(rejected).toBeVisible();
  await expect(page.getByText("Too loud")).toBeVisible();
});
