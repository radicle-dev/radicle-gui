import type { Page } from "@playwright/test";
import type { RadiclePeer } from "@tests/support/peerManager.js";

import { createProject } from "@tests/support/collaboration.js";
import {
  expect,
  reload,
  test,
  waitForCommand,
} from "@tests/support/fixtures.js";

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

async function openIssue(page: Page, peer: RadiclePeer) {
  const { rid, issueId } = await createProject(peer);
  await page.goto(`/repos/${rid}/issues/${issueId}`);
  await expect(
    page.getByRole("button", { name: "The notes are too quiet" }),
  ).toBeVisible();
  return { rid, issueId };
}

test("labels can be added and removed", async ({ page, peer }) => {
  await openIssue(page, peer);

  await page.getByRole("button", { name: "Add labels" }).click();
  await page.getByPlaceholder("Add label").fill("documentation");
  await waitForCommand(page, "edit_issue", () =>
    page.getByPlaceholder("Add label").press("Enter"),
  );
  const label = page.getByRole("button", { name: "documentation" });
  await expect(label).toBeVisible();

  await page.getByRole("button", { name: "Add labels" }).click();
  await page.getByPlaceholder("Add label").fill("documentation");
  await expect(page.getByText("This label is already assigned")).toBeVisible();
  await page.getByPlaceholder("Add label").fill("");

  await reload(page);
  await expect(label).toBeVisible();

  await label.click();
  await waitForCommand(page, "edit_issue", () =>
    label.getByRole("img", { name: "icon-close" }).click(),
  );
  await expect(label).toBeHidden();
  await reload(page);
  await expect(label).toBeHidden();
});

test("an assignee can be added by DID", async ({ page, peer }) => {
  await openIssue(page, peer);

  await page.getByRole("button", { name: "Add assignees" }).click();
  const input = page.getByPlaceholder(/^Alias or DID/);
  await input.fill("did:key:alice");
  await expect(page.getByText("This is not a valid DID")).toBeVisible();

  await input.fill(`did:key:${peer.nodeId}`);
  await waitForCommand(page, "edit_issue", () => input.press("Enter"));
  await expect(input).toBeHidden();

  const assignees = page.getByRole("button", {
    name: "icon-avatar-incognito Assignees",
    exact: true,
  });
  await expect(assignees).toBeVisible();
  await reload(page);
  await assignees.click();
  await page.getByPlaceholder(/^Alias or DID/).fill(peer.nodeId);
  await expect(page.getByText("This assignee is already added")).toBeVisible();
});

test("an assignee can be picked by alias", async ({ page, peer }) => {
  await openIssue(page, peer);

  await page.getByRole("button", { name: "Add assignees" }).click();
  const input = page.getByPlaceholder(/^Alias or DID/);
  await input.fill("zzz");
  await expect(page.getByText("No one matches “zzz”")).toBeVisible();
  await input.fill("ali");
  const suggestion = page.locator(".suggestion", { hasText: "alice" });
  await expect(suggestion).toContainText("you");
  await waitForCommand(page, "edit_issue", () => input.press("Enter"));
  await expect(input).toBeHidden();

  const assignees = page.getByRole("button", {
    name: "icon-avatar-incognito Assignees",
    exact: true,
  });
  await reload(page);
  await assignees.click();
  await page.getByPlaceholder(/^Alias or DID/).fill("alice");
  await expect(page.getByText("This assignee is already added")).toBeVisible();
});

test("an issue can be closed and reopened", async ({ page, peer }) => {
  await openIssue(page, peer);

  await page.getByRole("button", { name: /^icon-issue Open/ }).click();
  await page.getByRole("button", { name: /Closed as solved$/ }).click();
  const closed = page.getByRole("button", { name: /Closed as solved/ });
  await expect(closed).toBeVisible();

  await reload(page);
  await expect(closed).toBeVisible();

  await closed.click();
  await page
    .getByRole("button", { name: "icon-issue Open", exact: true })
    .click();
  await expect(closed).toBeHidden();
});

test("the title can be edited", async ({ page, peer }) => {
  await openIssue(page, peer);

  await page.getByRole("button", { name: "The notes are too quiet" }).click();
  const input = page.locator("input:focus");
  await input.fill("The notes are much too quiet");
  await input.press("Enter");

  const title = page.getByRole("button", {
    name: "The notes are much too quiet",
  });
  await expect(title).toBeVisible();
  await reload(page);
  await expect(title).toBeVisible();
});

test("a comment can be edited and deleted", async ({ page, peer }) => {
  await openIssue(page, peer);

  await page.getByPlaceholder("Leave a comment").fill("I read them daily");
  await page.getByRole("button", { name: /^Comment/ }).click();
  await expect(page.getByText("I read them daily")).toBeVisible();

  await commentAction(page, "I read them daily", "Edit");
  await page
    .getByPlaceholder("Leave a comment")
    .first()
    .fill("I read them weekly");
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByText("I read them weekly")).toBeVisible();

  await reload(page);
  await expect(page.getByText("I read them weekly")).toBeVisible();

  await commentAction(page, "I read them weekly", "Delete");
  await expect(page.getByText("I read them weekly")).toBeHidden();
  await reload(page);
  await expect(page.getByText("I read them weekly")).toBeHidden();
});

test("an issue can be deleted", async ({ page, peer }) => {
  const { rid } = await openIssue(page, peer);

  await page.getByTitle("Delete issue from your node").click();
  await page
    .getByRole("button", { name: "icon-trash Delete", exact: true })
    .last()
    .click();

  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/issues`));
  // The list renders with its items, so once its filters show it's loaded.
  await expect(page.getByRole("link", { name: /Closed/ })).toBeVisible();
  await expect(page.getByText("The notes are too quiet")).toBeHidden();
});

test("a reaction can be added to the description", async ({ page, peer }) => {
  await openIssue(page, peer);

  await page.getByText("Nobody reads them.").hover();
  await page.getByTitle("React").first().click();
  await waitForCommand(page, "edit_issue", () =>
    page.getByRole("button", { name: "👍" }).click(),
  );
  await reload(page);
  await expect(page.getByTitle("Remove reaction")).toBeVisible();
});
