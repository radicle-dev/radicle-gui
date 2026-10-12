import type { Page } from "@playwright/test";
import type { PeerManager } from "@tests/support/peerManager.js";

import * as Path from "node:path";

import {
  clone,
  createCollaborators,
  createProject,
  waitForCobFrom,
} from "@tests/support/collaboration.js";
import {
  expect,
  reload,
  test,
  useBackend,
  waitForCommand,
} from "@tests/support/fixtures.js";

// Eve comments on bob's issue; the app runs as bob, who gets notified.
async function withNotification(page: Page, peerManager: PeerManager) {
  const { bob, eve } = await createCollaborators(peerManager);
  const { rid, issueId } = await createProject(bob);
  await clone(eve, rid);
  await eve.rad(
    ["issue", "comment", issueId, "--message", "They are fine by me"],
    { cwd: Path.join(eve.checkoutPath, "project") },
  );
  await waitForCobFrom(bob, eve, rid, issueId);
  await bob.startHttpd();
  await useBackend(page, bob);
  await page.goto("/inbox");
  const teaser = page.getByText("The notes are too quiet");
  await expect(teaser).toBeVisible();
  return teaser;
}

test("a notification can be deleted", async ({ page, peerManager }) => {
  const teaser = await withNotification(page, peerManager);

  await teaser.hover();
  await waitForCommand(page, "clear_notifications", () =>
    page.getByTitle("Delete", { exact: true }).click(),
  );
  await expect(teaser).toBeHidden();
  await reload(page);
  await expect(teaser).toBeHidden();
});

test("all notifications can be cleared", async ({ page, peerManager }) => {
  const teaser = await withNotification(page, peerManager);

  // The clear button only shows while the header is hovered.
  await page
    .getByRole("button", { name: "icon-search", exact: true })
    .last()
    .hover();
  await page
    .getByRole("button", { name: "icon-clear-all", exact: true })
    .click();
  await waitForCommand(page, "clear_notifications", () =>
    page.getByRole("button", { name: /^icon-clear-all Delete \d+$/ }).click(),
  );
  await expect(teaser).toBeHidden();
  await reload(page);
  await expect(teaser).toBeHidden();
});
