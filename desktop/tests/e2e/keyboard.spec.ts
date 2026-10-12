import type { RadiclePeer } from "@tests/support/peerManager.js";

import * as Fs from "node:fs/promises";
import * as Path from "node:path";

import { cobRid, expect, test } from "@tests/support/fixtures.js";
import { createRepo } from "@tests/support/repo.js";

test("? lists the shortcuts and Escape closes the list", async ({ page }) => {
  await page.goto("/inbox");
  await page.keyboard.press("?");
  const entry = page.getByText("Toggle sidebar");
  await expect(entry).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(entry).toBeHidden();
});

test("Mod+B toggles the sidebar", async ({ page }) => {
  await page.goto("/inbox");
  await expect(
    page.getByRole("button", { name: "Collapse sidebar" }),
  ).toBeVisible();

  await page.keyboard.press("ControlOrMeta+b");
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();
  await page.keyboard.press("ControlOrMeta+b");
  await expect(
    page.getByRole("button", { name: "Collapse sidebar" }),
  ).toBeVisible();
});

test("Mod+B in a comment makes text bold instead", async ({ page }) => {
  await page.goto(`/repos/${cobRid}/issues?status=all`);
  await page.getByText("This title has **markdown**").click();
  const comment = page.getByPlaceholder("Leave a comment");
  await comment.fill("loud");
  await comment.press("ControlOrMeta+a");
  await comment.press("ControlOrMeta+b");

  await expect(comment).toHaveValue("**loud**");
  await expect(
    page.getByRole("button", { name: "Collapse sidebar" }),
  ).toBeVisible();
});

test("Mod+N opens a new issue in a repo", async ({ page }) => {
  await page.goto(`/repos/${cobRid}/issues`);
  await expect(page.getByText("This title has **markdown**")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+n");
  await expect(page.getByPlaceholder("Title")).toBeVisible();
});

test("Mod+, opens the settings", async ({ page }) => {
  await page.goto("/inbox");
  await page.keyboard.press("ControlOrMeta+,");
  await expect(page.getByText("Diff style")).toBeVisible();
});

test("Mod+1 opens the first repo in the sidebar", async ({ page }) => {
  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: /cobs/ })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+1");
  await expect(page).toHaveURL(/\/repos\/rad:/);
});

async function createTwoCommitPatch(peer: RadiclePeer) {
  const { rid, repoFolder } = await createRepo(peer, { name: "steps" });
  await peer.git(["switch", "-c", "feature/steps"], { cwd: repoFolder });
  for (const name of ["first.txt", "second.txt"]) {
    await Fs.writeFile(Path.join(repoFolder, name), `${name}\n`);
    await peer.git(["add", name], { cwd: repoFolder });
    await peer.git(["commit", "-m", `Add ${name}`], { cwd: repoFolder });
  }
  const { stderr } = await peer.git(
    ["push", "-o", "patch.message=Add two files", "rad", "HEAD:refs/patches"],
    { cwd: repoFolder },
  );
  const patchId = stderr.match(/✓ Patch ([0-9a-f]+) opened/)?.[1];
  if (!patchId) throw new Error("Not able to parse patch id");
  return { rid, patchId };
}

test("arrow keys step through a patch's commits", async ({ page, peer }) => {
  const { rid, patchId } = await createTwoCommitPatch(peer);
  await page.goto(`/repos/${rid}/patches/${patchId}?view=changes`);
  const first = page.getByText("first.txt", { exact: true }).first();
  const second = page.getByText("second.txt", { exact: true }).first();
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();

  await page.keyboard.press("ArrowDown");
  const showAll = page.getByTitle("Show all changes");
  await expect(showAll).toBeVisible();
  const onlyFirst = await first.isVisible();
  await expect(onlyFirst ? second : first).toBeHidden();

  await page.keyboard.press("ArrowDown");
  await expect(onlyFirst ? second : first).toBeVisible();
  await expect(onlyFirst ? first : second).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(showAll).toBeHidden();
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
});
