import type { Page } from "@playwright/test";

import * as Path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createProject } from "@tests/support/collaboration.js";
import {
  expect,
  reload,
  test,
  waitForCommand,
} from "@tests/support/fixtures.js";

// Breaks a cached COB so the list can no longer read it, while the counts,
// which only look at its state, still include it.
function corruptCache(
  stateDir: string,
  table: "issues" | "patches",
  rid: string,
) {
  const db = new DatabaseSync(
    Path.join(stateDir, "peers", "httpd", "home", "cobs", "cache.db"),
  );
  const column = table === "issues" ? "issue" : "patch";
  const field = table === "issues" ? "$.thread" : "$.revisions";
  db.prepare(
    `UPDATE ${table} SET ${column} = json_set(${column}, '${field}', 'broken') WHERE repo = ?`,
  ).run(rid);
  db.close();
}

async function rebuild(page: Page, command: string) {
  const warning = page.getByText("There's a problem with your COB cache");
  await expect(warning).toBeVisible();
  await waitForCommand(page, command, () =>
    page.getByRole("button", { name: "Rebuild cache" }).click(),
  );
  return warning;
}

test("a broken issue cache can be rebuilt", async ({
  page,
  peer,
  stateDir,
}) => {
  const { rid } = await createProject(peer);
  corruptCache(stateDir, "issues", rid);

  await page.goto(`/repos/${rid}/issues`);
  const warning = await rebuild(page, "rebuild_issue_cache");

  await expect(page.getByText("The notes are too quiet")).toBeVisible();
  await reload(page);
  await expect(page.getByText("The notes are too quiet")).toBeVisible();
  await expect(warning).toBeHidden();
});

test("a broken patch cache can be rebuilt", async ({
  page,
  peer,
  stateDir,
}) => {
  const { rid } = await createProject(peer);
  corruptCache(stateDir, "patches", rid);

  await page.goto(`/repos/${rid}/patches`);
  const warning = await rebuild(page, "rebuild_patch_cache");

  await expect(page.getByText("Shout the third line")).toBeVisible();
  await reload(page);
  await expect(page.getByText("Shout the third line")).toBeVisible();
  await expect(warning).toBeHidden();
});
