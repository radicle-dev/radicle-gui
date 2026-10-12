import type { Page } from "@playwright/test";
import type { PeerManager } from "@tests/support/peerManager.js";

import {
  clone,
  createCollaborators,
  createProject,
} from "@tests/support/collaboration.js";
import {
  expect,
  goto,
  test,
  useBackend,
  waitForCommand,
} from "@tests/support/fixtures.js";

// Opens bob's project as eve, who cloned it but isn't a delegate.
async function asContributor(page: Page, peerManager: PeerManager) {
  const { bob, eve } = await createCollaborators(peerManager);
  const project = await createProject(bob);
  await bob.rad(
    [
      "issue",
      "comment",
      project.issueId,
      "--message",
      "Bob's own comment",
      "--quiet",
    ],
    { cwd: project.repoFolder },
  );
  await clone(eve, project.rid);
  await eve.startHttpd();
  await useBackend(page, eve);
  return project;
}

test("a contributor can't edit an issue's metadata or delete it", async ({
  page,
  peerManager,
}) => {
  const { rid, issueId } = await asContributor(page, peerManager);
  await page.goto(`/repos/${rid}/issues/${issueId}`);
  await expect(page.getByText("Nobody reads them.")).toBeVisible();

  await expect(page.getByRole("button", { name: "Add labels" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Add assignees" }),
  ).toBeDisabled();
  await expect(
    page.getByTitle(
      "Only the issue author and delegates can change the issue state",
    ),
  ).toBeVisible();
  await expect(page.getByTitle("Delete issue from your node")).toBeHidden();
});

test("a contributor can't edit or delete someone else's comment", async ({
  page,
  peerManager,
}) => {
  const { rid, issueId } = await asContributor(page, peerManager);
  await page.goto(`/repos/${rid}/issues/${issueId}`);

  await page.getByText("Bob's own comment").hover();
  const toggle = page.getByTitle("Comment actions").last();
  await toggle.click();
  const menuItem = (action: string) =>
    toggle.locator(
      `xpath=following::*[@role="button"][normalize-space()="${action}"][1]`,
    );
  await expect(menuItem("Copy ID")).toBeVisible();
  await expect(menuItem("Edit")).toHaveCount(0);
  await expect(menuItem("Delete")).toHaveCount(0);
});

test("a contributor can't change a patch's state or delete it", async ({
  page,
  peerManager,
}) => {
  const { rid, patchId } = await asContributor(page, peerManager);
  await page.goto(`/repos/${rid}/patches/${patchId}`);
  await expect(
    page.getByRole("button", { name: "Shout the third line" }),
  ).toBeVisible();

  await expect(
    page.getByTitle(
      "Only delegates and the patch author can change the patch state",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add labels" })).toBeDisabled();
  await expect(page.getByTitle("Delete patch from your node")).toBeHidden();
});

test("a contributor can't resolve someone else's review comment", async ({
  page,
  peerManager,
}) => {
  const { bob, eve } = await createCollaborators(peerManager);
  const { rid, patchId } = await createProject(bob);
  await clone(eve, rid);
  await bob.startHttpd();
  await useBackend(page, bob);

  // Bob reviews his own patch with a comment on the changed line.
  await page.goto(`/repos/${rid}/patches/${patchId}?view=changes`);
  await page
    .locator(
      '[data-unified] [data-column-number="3"]:not([data-line-type="change-deletion"])',
    )
    .hover();
  await page.locator("[data-utility-button]").click();
  await page.getByPlaceholder("Leave a comment").fill("Keep it loud");
  await page
    .getByLabel("extended-textarea")
    .filter({ has: page.getByPlaceholder("Leave a comment") })
    .getByRole("button", { name: /^Start review/ })
    .click();
  await waitForCommand(page, "create_patch_review", () =>
    page.getByRole("button", { name: "Accept revision", exact: true }).click(),
  );
  await eve.rad(["sync", rid, "--fetch"]);

  // Now as eve.
  await eve.startHttpd();
  await useBackend(page, eve);
  await goto(page, `/repos/${rid}/patches/${patchId}?view=changes`);
  const thread = page.getByRole("group").filter({ hasText: "Keep it loud" });
  await thread.hover();
  await expect(thread.getByTitle("Reply")).toBeVisible();
  await expect(thread.getByTitle("Mark as resolved")).toHaveCount(0);
});
