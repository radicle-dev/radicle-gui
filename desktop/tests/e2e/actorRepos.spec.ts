import type { Page } from "@playwright/test";
import type { RadiclePeer } from "@tests/support/peerManager.js";

import { api } from "@tests/support/api.js";
import { createProject } from "@tests/support/collaboration.js";
import { expect, test } from "@tests/support/fixtures.js";

// A project and an actor in the peer's storage, with names that share a
// start so one query finds both.
async function projectAndActor(page: Page, peer: RadiclePeer) {
  const project = await createProject(peer, "tulips");
  const actor = (await api(page, peer, "create_actor", {
    profile: { version: 1, displayName: "tulips-keeper" },
    opts: { announce: false },
  })) as { rid: string };

  return { project, actorRid: actor.rid };
}

async function turnLabOn(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("labs.actorRepos", "true"),
  );
}

function projectLink(page: Page) {
  return page.getByRole("link", { name: /tulips(?!-keeper)/ });
}

function actorLink(page: Page) {
  return page.getByRole("link", { name: /tulips-keeper/ });
}

test("an actor's repository is not listed while the lab is on", async ({
  page,
  peer,
}) => {
  await projectAndActor(page, peer);
  await turnLabOn(page);

  await page.goto("/inbox");

  await expect(projectLink(page)).toBeVisible();
  await expect(actorLink(page)).toBeHidden();
});

test("an actor's repository is listed while the lab is off", async ({
  page,
  peer,
}) => {
  await projectAndActor(page, peer);

  await page.goto("/inbox");

  await expect(projectLink(page)).toBeVisible();
  await expect(actorLink(page)).toBeVisible();
});

test("an actor's repository is not offered as a mention", async ({
  page,
  peer,
}) => {
  const { project } = await projectAndActor(page, peer);
  await turnLabOn(page);

  await page.goto(`/repos/${project.rid}/issues/${project.issueId}`);
  await page.getByPlaceholder("Leave a comment").click();
  await page.keyboard.insertText("@tulips");

  const suggestions = page.locator(".suggestion");
  await expect(suggestions.filter({ hasText: "tulips" })).toHaveCount(1);
  await expect(suggestions.filter({ hasText: "tulips-keeper" })).toHaveCount(0);
});

test("adding an actor's repository says it is here already", async ({
  page,
  peer,
}) => {
  const { actorRid } = await projectAndActor(page, peer);
  await turnLabOn(page);

  await page.goto("/inbox");
  await page.getByRole("button", { name: "icon-plus", exact: true }).click();
  const input = page.getByPlaceholder(/^RID, e\.g\./);
  await input.fill(actorRid);
  await input.press("Enter");

  await expect(page.getByText("This repo is already seeded")).toBeVisible();
});

test("turning the lab on hides an actor's repository at once", async ({
  page,
  peer,
}) => {
  await projectAndActor(page, peer);

  await page.goto("/inbox");
  await expect(actorLink(page)).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await page
    .locator(".row", { hasText: "Rich profiles" })
    .getByRole("button", { name: "On", exact: true })
    .click();
  await page.keyboard.press("Escape");

  await expect(projectLink(page)).toBeVisible();
  await expect(actorLink(page)).toBeHidden();
});
