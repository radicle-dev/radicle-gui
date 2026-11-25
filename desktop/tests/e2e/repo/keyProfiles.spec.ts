import type { Page } from "@playwright/test";
import type { PeerManager } from "@tests/support/peerManager.js";

import * as Path from "node:path";

import { api } from "@tests/support/api.js";
import {
  clone,
  createCollaborators,
  createProject,
  waitForCobFrom,
} from "@tests/support/collaboration.js";
import { expect, test, useBackend } from "@tests/support/fixtures.js";

// Bob's project, opened as bob. Eve has a profile that bob's node holds, and
// she is assigned to the issue and has reacted to it.
async function withAnotherProfile(
  page: Page,
  peerManager: PeerManager,
  lab: boolean,
) {
  const { bob, eve } = await createCollaborators(peerManager);
  const project = await createProject(bob);
  await clone(eve, project.rid);

  await eve.startHttpd();
  const actor = (await api(page, eve, "create_actor", {
    profile: { version: 1, displayName: "Eve Adams" },
    opts: { announce: true },
  })) as { rid: string };
  await bob.rad(["seed", actor.rid]);

  await eve.rad(
    [
      "issue",
      "react",
      project.issueId,
      "--emoji",
      "👍",
      "--to",
      project.issueId,
    ],
    { cwd: Path.join(eve.checkoutPath, "project") },
  );
  await waitForCobFrom(bob, eve, project.rid, project.issueId);
  await bob.rad(
    ["issue", "assign", project.issueId, "--add", `did:key:${eve.nodeId}`],
    { cwd: project.repoFolder },
  );

  await bob.startHttpd();
  await useBackend(page, bob);
  await page.addInitScript(
    value => localStorage.setItem("labs.actorRepos", value),
    String(lab),
  );

  return project;
}

function reaction(page: Page) {
  return page.getByRole("button", { name: /^👍/ });
}

async function openAssignMenu(page: Page, rid: string) {
  await page.goto(`/repos/${rid}/issues`);
  await page.getByText("The notes are too quiet").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Assign" }).hover();
}

test("another person's key shows as their profile", async ({
  page,
  peerManager,
}) => {
  const { rid, issueId } = await withAnotherProfile(page, peerManager, true);

  await page.goto(`/repos/${rid}/issues/${issueId}`);
  await expect(reaction(page)).toContainText("Eve Adams");
  await expect(reaction(page)).toHaveAttribute("title", "Eve Adams");

  // Typing still matches the alias, so it stays beside the name.
  await page.getByPlaceholder("Leave a comment").click();
  await page.keyboard.insertText("@ev");
  const mention = page.locator(".suggestion", { hasText: "Eve Adams" });
  await expect(mention).toContainText("eve ·");

  // Two keys of one profile share its name, so the alias tells them apart.
  await openAssignMenu(page, rid);
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Eve Adams · eve" }),
  ).toBeVisible();
});

test("without the lab the same key shows as its alias", async ({
  page,
  peerManager,
}) => {
  const { rid, issueId } = await withAnotherProfile(page, peerManager, false);

  await page.goto(`/repos/${rid}/issues/${issueId}`);
  await expect(reaction(page)).toContainText("eve");
  await expect(reaction(page)).toHaveAttribute("title", "eve");

  await openAssignMenu(page, rid);
  await expect(
    page.getByRole("menuitemcheckbox", { name: / eve$/ }),
  ).toBeVisible();
  await expect(page.getByText("Eve Adams")).toBeHidden();
});
