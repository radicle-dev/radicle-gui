import { expect, test } from "@tests/support/fixtures.js";
import { createRepo, dropProjectPayload } from "@tests/support/repo.js";

test("list a repo without a name", async ({ page, peer }) => {
  const name = "no-project-card";
  const { rid, repoFolder } = await createRepo(peer, { name });
  await dropProjectPayload(peer, repoFolder);

  await page.goto(peer.uiUrl());
  const card = page.locator(".repo-card", { hasText: rid.slice(-6) });
  await expect(card.getByTitle("This repository has no name")).toBeVisible();
  await expect(card.getByText(name)).toBeHidden();
});

test("open a repo at its canonical refs default branch", async ({
  page,
  peer,
}) => {
  const { rid, repoFolder } = await createRepo(peer, {
    name: "no-project-source",
  });
  await dropProjectPayload(peer, repoFolder);

  await page.goto(`${peer.uiUrl()}/${rid}`);
  await expect(page.getByRole("button", { name: "Commits 1" })).toBeVisible();
  await expect(page.getByTitle("This repository has no name")).toBeVisible();

  await page.getByRole("link", { name: "Issues" }).click();
  await expect(page).toHaveURL(`${peer.uiUrl()}/${rid}/issues`);
});

test("offer branches when the node reports no default branch", async ({
  page,
  peer,
}) => {
  const { rid, repoFolder } = await createRepo(peer, {
    name: "no-project-unavailable",
  });
  await dropProjectPayload(peer, repoFolder);

  // Newer nodes report the default branch, and the client resolves it on older
  // ones from the canonical refs payload, so leave out both.
  await page.route(
    ({ pathname }) => /^\/api(\/v1)?\/repos\/[^/]+$/.test(pathname),
    async route => {
      const response = await route.fetch();
      const repo = await response.json();
      delete repo.defaultBranch;
      delete repo.payloads["xyz.radicle.crefs"];
      await route.fulfill({ response, json: repo });
    },
  );

  await page.goto(`${peer.uiUrl()}/${rid}`);
  await expect(page.getByRole("button", { name: /^Commits/ })).toBeHidden();

  await page.getByTitle("Change branch").click();
  await page.getByText("main", { exact: true }).click();
  await expect(page).toHaveURL(`${peer.uiUrl()}/${rid}/tree/main`);
  await expect(page.getByRole("button", { name: "Commits 1" })).toBeVisible();
});
