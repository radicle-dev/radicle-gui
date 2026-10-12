import type { Page } from "@playwright/test";
import type { PeerManager } from "@tests/support/peerManager.js";

import * as Fs from "node:fs/promises";
import * as Path from "node:path";

import { createCollaborators } from "@tests/support/collaboration.js";
import {
  expect,
  reload,
  test,
  useBackend,
  waitForCommand,
} from "@tests/support/fixtures.js";
import { createRepo } from "@tests/support/repo.js";

test("seeds a repo from the network by its bare RID", async ({
  page,
  peerManager,
}) => {
  const { bob, eve } = await createCollaborators(peerManager);
  const { rid } = await createRepo(eve, { name: "garden" });
  await bob.startHttpd();
  await useBackend(page, bob);

  await page.goto("/inbox");
  await page.getByRole("button", { name: "icon-plus", exact: true }).click();
  const input = page.getByPlaceholder(/^RID, e\.g\./);
  await input.fill(rid.replace(/^rad:/, ""));
  await waitForCommand(page, "seed", () =>
    page.getByRole("button", { name: "icon-seed Seed", exact: true }).click(),
  );

  await expect(page.getByRole("link", { name: /garden/ })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "icon-plus", exact: true }).click();
  await input.fill(rid);
  await input.press("Enter");
  await expect(
    page.getByText(/This repo is already (seeded|queued for fetching)/),
  ).toBeVisible();
});

async function stopSeeding(page: Page, name: string, deleteFiles: boolean) {
  await page.getByRole("link", { name: new RegExp(name) }).click({
    button: "right",
  });
  await page.getByRole("menuitem", { name: /Unseed/ }).click();
  if (deleteFiles) {
    await page.getByText("Delete the files from local storage").click();
  }
  await waitForCommand(page, deleteFiles ? "clean" : "unseed", () =>
    page.getByRole("button", { name: /Unseed$/ }).click(),
  );
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeHidden();
}

async function seededFrom(peerManager: PeerManager, page: Page) {
  const { bob, eve } = await createCollaborators(peerManager);
  const { rid } = await createRepo(eve, { name: "garden" });
  await bob.rad(["seed", rid]);
  await bob.startHttpd();
  await useBackend(page, bob);
  await page.goto("/inbox");
  return rid;
}

function storedRepo(stateDir: string, rid: string) {
  return Path.join(
    stateDir,
    "peers",
    "bob",
    "home",
    "storage",
    rid.replace(/^rad:/, ""),
  );
}

async function exists(path: string) {
  return Fs.stat(path).then(
    () => true,
    () => false,
  );
}

test("unseeding keeps the repo's files", async ({
  page,
  peerManager,
  stateDir,
}) => {
  const rid = await seededFrom(peerManager, page);
  await stopSeeding(page, "garden", false);
  await reload(page);
  await expect(page.getByRole("link", { name: /garden/ })).toBeHidden();
  expect(await exists(storedRepo(stateDir, rid))).toBe(true);
});

test("unseeding can delete the repo's files", async ({
  page,
  peerManager,
  stateDir,
}) => {
  const rid = await seededFrom(peerManager, page);
  expect(await exists(storedRepo(stateDir, rid))).toBe(true);
  await stopSeeding(page, "garden", true);
  expect(await exists(storedRepo(stateDir, rid))).toBe(false);
});
