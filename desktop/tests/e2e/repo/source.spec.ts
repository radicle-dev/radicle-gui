import type { RadiclePeer } from "@tests/support/peerManager.js";

import * as Fs from "node:fs/promises";
import * as Path from "node:path";

import { clone, createCollaborators } from "@tests/support/collaboration.js";
import { cobRid, expect, test, useBackend } from "@tests/support/fixtures.js";
import { createRepo } from "@tests/support/repo.js";

async function createDocsRepo(peer: RadiclePeer) {
  const { rid, repoFolder } = await createRepo(peer, { name: "docs" });
  await Fs.writeFile(
    Path.join(repoFolder, "README.md"),
    "# Docs\n\nWelcome to the docs.\n",
  );
  await Fs.mkdir(Path.join(repoFolder, "guides"));
  await Fs.writeFile(
    Path.join(repoFolder, "guides", "setup.md"),
    "Install it first.\n",
  );
  await peer.git(["add", "."], { cwd: repoFolder });
  await peer.git(["commit", "-m", "Write the docs"], { cwd: repoFolder });
  await peer.git(["push", "rad", "main"], { cwd: repoFolder });
  return { rid, repoFolder };
}

test("the repo home shows the README and browses the tree", async ({
  page,
  peer,
}) => {
  const { rid } = await createDocsRepo(peer);
  await page.goto(`/repos/${rid}/home`);
  await expect(page.getByText("Welcome to the docs.")).toBeVisible();

  await page.getByText("guides", { exact: true }).click();
  await page.getByText("setup.md", { exact: true }).click();
  await expect(page.getByText("Install it first.")).toBeVisible();
});

async function createNestedDocsRepo(peer: RadiclePeer) {
  const { rid, repoFolder } = await createRepo(peer, { name: "docs" });
  const files = {
    "README.md": "# Docs\n\nWelcome to the docs.\n",
    "guides/setup.md": "Install it first.\n",
    "guides/usage.md": "Then use it.\n",
    "api/index.md": "The API reference.\n",
  };
  for (const [file, content] of Object.entries(files)) {
    await Fs.mkdir(Path.dirname(Path.join(repoFolder, file)), {
      recursive: true,
    });
    await Fs.writeFile(Path.join(repoFolder, file), content);
  }
  await peer.git(["add", "."], { cwd: repoFolder });
  await peer.git(["commit", "-m", "Write the docs"], { cwd: repoFolder });
  await peer.git(["push", "rad", "main"], { cwd: repoFolder });
  return { rid, repoFolder };
}

test("selecting a file keeps the open folder's entries rendered", async ({
  page,
  peer,
}) => {
  const { rid } = await createNestedDocsRepo(peer);
  await page.goto(`/repos/${rid}/home`);
  await expect(page.getByText("Welcome to the docs.")).toBeVisible();

  await page.getByText("guides", { exact: true }).click();
  const sibling = await page
    .getByText("usage.md", { exact: true })
    .elementHandle();
  await page.getByText("setup.md", { exact: true }).click();
  await expect(page.getByText("Install it first.")).toBeVisible();

  expect(await sibling?.evaluate(el => el.isConnected)).toBe(true);
});

test("folders stay open when selecting a file elsewhere", async ({
  page,
  peer,
}) => {
  const { rid } = await createNestedDocsRepo(peer);
  await page.goto(`/repos/${rid}/home`);

  await page.getByText("guides", { exact: true }).click();
  await page.getByText("setup.md", { exact: true }).click();
  await expect(page.getByText("Install it first.")).toBeVisible();

  await page.getByText("api", { exact: true }).click();
  await page.getByText("index.md", { exact: true }).click();
  await expect(page.getByText("The API reference.")).toBeVisible();
  await expect(page.getByText("usage.md", { exact: true })).toBeVisible();

  await page.getByText("guides", { exact: true }).click();
  await expect(page.getByText("usage.md", { exact: true })).toBeHidden();
  await page.getByText("README.md", { exact: true }).click();
  await expect(page.getByText("Welcome to the docs.")).toBeVisible();
  await expect(page.getByText("usage.md", { exact: true })).toBeHidden();
  await expect(page.getByText("index.md", { exact: true })).toBeVisible();
});

test("commits are listed and open with their changes", async ({
  page,
  peer,
}) => {
  const { rid } = await createDocsRepo(peer);
  await page.goto(`/repos/${rid}/commits`);

  await page
    .getByRole("button", { name: "commit-teaser" })
    .filter({ hasText: "Write the docs" })
    .click();
  await expect(page).toHaveURL(/\/commits\/[0-9a-f]{40}/);
  await expect(page.getByText("Write the docs").first()).toBeVisible();
  await expect(page.getByText("guides/setup.md").first()).toBeVisible();
});

test("a contributor's branch can be browsed", async ({ page, peerManager }) => {
  const { bob, eve } = await createCollaborators(peerManager);
  const { rid } = await createDocsRepo(bob);
  await clone(eve, rid);
  const eveCopy = Path.join(eve.checkoutPath, "docs");
  await eve.git(["switch", "-c", "friendlier"], { cwd: eveCopy });
  await Fs.writeFile(
    Path.join(eveCopy, "README.md"),
    "# Docs\n\nHello, and welcome.\n",
  );
  await eve.git(["commit", "-am", "Greet readers"], { cwd: eveCopy });
  await eve.git(["push", "rad", "friendlier"], { cwd: eveCopy });
  await bob.rad(["sync", rid, "--fetch"]);
  await bob.startHttpd();
  await useBackend(page, bob);

  await page.goto(`/repos/${rid}/home`);
  await expect(page.getByText("Welcome to the docs.")).toBeVisible();

  await page.getByTitle("Change branch or tag").click();
  await page.getByPlaceholder("Filter branches").fill("friendlier");
  await page
    .getByRole("link", { name: /friendlier/ })
    .first()
    .click();

  await expect(page).toHaveURL(new RegExp(`/remotes/${eve.nodeId}/friendlier`));
  await expect(page.getByText("Hello, and welcome.")).toBeVisible();
});

test("patches are filtered by state", async ({ page }) => {
  await page.goto(`/repos/${cobRid}/patches`);
  await expect(
    page.getByText("Taking another stab at the README"),
  ).toBeVisible();

  await page.getByRole("link", { name: /Merged/ }).click();
  await expect(page.getByText("Let's add a README")).toBeVisible();
  await expect(
    page.getByText("Taking another stab at the README"),
  ).toBeHidden();

  await page.getByRole("link", { name: /Archived/ }).click();
  await expect(
    page.getByText("This patch is going to be archived"),
  ).toBeVisible();
  await expect(page.getByText("Let's add a README")).toBeHidden();
});

test("the identity page lists accepted revisions", async ({ page, peer }) => {
  const { rid, repoFolder } = await createDocsRepo(peer);
  await peer.rad(
    [
      "id",
      "update",
      "--title",
      "Describe the docs",
      "--description",
      "So people know what this is.",
      "--payload",
      "xyz.radicle.project",
      "description",
      '"Docs for everyone"',
    ],
    { cwd: repoFolder },
  );

  await page.goto(`/repos/${rid}/identity`);
  await expect(
    page.getByRole("button", {
      name: /^icon-checkmark .*Describe the docs Current/,
    }),
  ).toBeVisible();
});
