import type { Page } from "@playwright/test";
import type { RadiclePeer } from "@tests/support/peerManager.js";

import * as Fs from "node:fs/promises";
import * as Path from "node:path";

import {
  createCollaborators,
  createProject,
} from "@tests/support/collaboration.js";
import {
  expect,
  goto,
  reload,
  test,
  useBackend,
  waitForCommand,
} from "@tests/support/fixtures.js";
import { createRepo } from "@tests/support/repo.js";

async function openIssue(page: Page, peer: RadiclePeer) {
  const project = await createProject(peer);
  await page.goto(`/repos/${project.rid}/issues/${project.issueId}`);
  await expect(
    page.getByRole("button", { name: "The notes are too quiet" }),
  ).toBeVisible();
  return project;
}

function commentBox(page: Page) {
  return page.getByPlaceholder("Leave a comment");
}

async function type(page: Page, text: string) {
  await commentBox(page).click();
  await page.keyboard.insertText(text);
}

function suggestion(page: Page, text: string) {
  return page.locator(".suggestion", { hasText: text });
}

async function comment(page: Page) {
  await waitForCommand(page, "create_issue_comment", () =>
    page.getByRole("button", { name: /^Comment/ }).click(),
  );
}

function rendered(page: Page) {
  return page.locator(".markdown");
}

test("mentioning yourself inserts your DID", async ({ page, peer }) => {
  await openIssue(page, peer);

  await type(page, "@ali");
  await expect(suggestion(page, "alice").first()).toContainText("you");
  await page.keyboard.press("Enter");
  await expect(commentBox(page)).toHaveValue(
    `[@alice](did:key:${peer.nodeId}) `,
  );

  await comment(page);
  await reload(page);
  await expect(
    rendered(page).locator(".mention-node", { hasText: "alice" }),
  ).toBeVisible();
});

test("a pasted patch URI becomes a chip that opens the patch", async ({
  page,
  peer,
}) => {
  const { rid, patchId } = await openIssue(page, peer);
  const uri = `${rid}/cob/xyz.radicle.patch/${patchId}`;

  await type(page, uri);
  await expect(suggestion(page, "Shout the third line")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(commentBox(page)).toHaveValue(`[Shout the third line](${uri}) `);

  await comment(page);
  await reload(page);
  const chip = rendered(page).locator("a.mention", {
    hasText: "Shout the third line",
  });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`/patches/${patchId}`));
});

test("a pasted release ID becomes a chip that opens the release", async ({
  page,
  peer,
}) => {
  const { rid, issueId, repoFolder } = await openIssue(page, peer);
  const file = Path.join(repoFolder, "build.tar");
  await Fs.writeFile(file, "artifact bytes");
  // The native file dialog only exists under Tauri.
  await page.route(/\/pick_artifact_files$/, route =>
    route.fulfill({ json: [file] }),
  );
  await goto(page, `/repos/${rid}/releases`);
  await page.getByRole("button", { name: "New release" }).click();
  await page.getByPlaceholder("Pick a commit or paste a SHA").click();
  await page.getByText("Add notes").click();
  await page.getByRole("button", { name: "Choose files" }).click();
  await page.getByRole("button", { name: "Create release" }).click();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));
  const releaseId = new URL(page.url()).pathname.split("/").pop()!;
  const uri = `${rid}/cob/dev.radicle.artifact/${releaseId}`;

  await goto(page, `/repos/${rid}/issues/${issueId}`);
  await type(page, "#Add");
  await expect(suggestion(page, "Add notes")).toBeVisible();
  await commentBox(page).fill("");

  await type(page, releaseId);
  await expect(suggestion(page, "Add notes")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(commentBox(page)).toHaveValue(`[Add notes](${uri}) `);

  await comment(page);
  await reload(page);
  const chip = rendered(page).locator("a.mention", { hasText: "Add notes" });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`/releases/${releaseId}`));
});

test("unsafe and invalid references stay inert", async ({ page, peer }) => {
  const { rid } = await openIssue(page, peer);

  await commentBox(page).fill(
    `[click me](javascript:alert(1)) and ${rid}/bogus here`,
  );
  await comment(page);
  await reload(page);

  const link = rendered(page).locator("a", { hasText: "click me" });
  await expect(link).toBeVisible();
  expect(await link.getAttribute("href")).toBeNull();
  await expect(rendered(page).getByText(`${rid}/bogus here`)).toBeVisible();
  await expect(rendered(page).locator("a.mention")).toHaveCount(0);
});

test("a typed commit prefix expands to the commit", async ({ page, peer }) => {
  const { rid, repoFolder } = await openIssue(page, peer);
  const { stdout: head } = await peer.git(["rev-parse", "main"], {
    cwd: repoFolder,
  });

  await type(page, `#${head.slice(0, 7)}`);
  await expect(suggestion(page, "Add notes")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(commentBox(page)).toHaveValue(
    `[Add notes](${rid}/commit/${head}) `,
  );

  await comment(page);
  await reload(page);
  await rendered(page).locator("a.mention", { hasText: "Add notes" }).click();
  await expect(page).toHaveURL(new RegExp(`/commits/${head}`));
});

test("a pasted explorer file URL opens the file in-app", async ({
  page,
  peer,
}) => {
  const { rid } = await openIssue(page, peer);
  const url = `https://radicle.network/nodes/seed.radicle.xyz/${rid}/tree/main/notes.txt#L3`;
  const uri = `${rid}/commit/main?path=notes.txt#L3`;

  await type(page, url);
  await expect(suggestion(page, "notes.txt")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(commentBox(page)).toHaveValue(
    `[project: notes.txt#L3](${uri}) `,
  );

  await comment(page);
  await reload(page);
  const link = rendered(page).locator("a", {
    hasText: "project: notes.txt#L3",
  });
  await link.click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Open in radicle.network" }),
  ).toHaveAttribute(
    "href",
    `https://radicle.network/nodes/rosa.radicle.network/${rid}/tree/main/notes.txt#L3`,
  );
  await expect(
    page.getByRole("menuitem", { name: "Copy rad: URI" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await link.click();
  await expect(page).toHaveURL(/\/home\/main\?path=notes\.txt/);
  await expect(page.locator("code", { hasText: "three" })).toBeVisible();
});

test("every reference type renders and links where it should", async ({
  page,
  peer,
}) => {
  const { rid, issueId, patchId, repoFolder } = await openIssue(page, peer);
  const { stdout: head } = await peer.git(["rev-parse", "main"], {
    cwd: repoFolder,
  });
  const nid = peer.nodeId;
  const missingRid = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";
  const missingOid = "f".repeat(40);
  const explorer = `https://radicle.network/nodes/rosa.radicle.network`;
  const repo = `/repos/${rid}`;

  const references: [string, string][] = [
    ["repo", rid],
    ["issue", `${rid}/cob/xyz.radicle.issue/${issueId}`],
    ["patch", `${rid}/cob/xyz.radicle.patch/${patchId}`],
    ["commit", `${rid}/commit/${head}`],
    ["person", `did:key:${nid}`],
    ["file", `${rid}/commit/main?path=notes.txt#L2`],
    ["root", `${rid}/commit/main?path=`],
    ["branch", `${rid}/commit/main`],
    ["tag", `${rid}/tag/v1.0`],
    ["remote", `${rid}/${nid}`],
    ["issues", `${rid}/cob/xyz.radicle.issue`],
    ["patches", `${rid}/cob/xyz.radicle.patch`],
    ["release", `${rid}/cob/dev.radicle.artifact/${missingOid}`],
    ["releases", `${rid}/cob/dev.radicle.artifact`],
    ["tree", `${rid}/tree/${missingOid}`],
    ["missing repo", missingRid],
    ["missing issue", `${rid}/cob/xyz.radicle.issue/${missingOid}`],
  ];
  await commentBox(page).fill(
    references.map(([label, uri]) => `- [${label}](${uri})`).join("\n"),
  );
  await comment(page);
  await reload(page);
  const body = rendered(page).last();
  const link = (href: string) => body.locator(`a[href="${href}"]`);

  await expect(link(`${repo}/home`).first()).toHaveClass(/mention/);
  await expect(link(`${repo}/issues/${issueId}?status=all`)).toContainText(
    "The notes are too quiet",
  );
  await expect(link(`${repo}/patches/${patchId}`)).toContainText(
    "Shout the third line",
  );
  await expect(link(`${repo}/commits/${head}`)).toContainText("Add notes");
  await expect(body.locator(".mention-node")).toContainText("alice");

  await expect(link(`${repo}/home/main?path=notes.txt`)).toHaveText("file");
  await expect(link(`${repo}/home/main`)).toHaveText(["root", "branch"]);
  await expect(link(`${repo}/home/v1.0`)).toHaveText("tag");
  await expect(link(`${repo}/home/remotes/${nid}`)).toHaveText("remote");
  await expect(link(`${repo}/issues?status=all`)).toHaveText("issues");
  await expect(link(`${repo}/patches`)).toHaveText("patches");
  const missingRelease = link(`${explorer}/${rid}/releases/${missingOid}`);
  await expect(missingRelease).toHaveClass(/unresolved/);
  await expect(missingRelease).toHaveAttribute("target", "_blank");
  await expect(link(`${repo}/releases`)).toHaveText("releases");
  await expect(
    body.locator("a:not([href])", { hasText: "tree" }),
  ).toBeVisible();

  const missingRepo = link(`${explorer}/${missingRid}`);
  await expect(missingRepo).toHaveClass(/unresolved/);
  await expect(missingRepo).toContainText("z3gqcJ");
  const missingIssue = link(`${explorer}/${rid}/issues/${missingOid}`);
  await expect(missingIssue).toHaveClass(/unresolved/);
  await expect(missingIssue).toContainText("missing issue");
  await expect(missingIssue).toContainText("fffffff");

  await link(`${repo}/patches/${patchId}`).click({ button: "right" });
  await expect(page.getByRole("menuitem")).toHaveText([
    "Open in radicle.network",
    "Copy link to radicle.network",
    "Copy rad: URI",
  ]);
  await page.keyboard.press("Escape");

  await link(`${repo}/issues?status=all`).click();
  await expect(page).toHaveURL(/\/issues\?status=all$/);
});

test("a repo that isn't here can be seeded from its chip", async ({
  page,
  peerManager,
}) => {
  const { bob, eve } = await createCollaborators(peerManager);
  const { rid: garden } = await createRepo(eve, { name: "garden" });
  await bob.startHttpd();
  await useBackend(page, bob);
  await openIssue(page, bob);

  await commentBox(page).fill(`[garden](${garden})`);
  await comment(page);
  await reload(page);
  const chip = rendered(page).last().locator("a.mention.unresolved");
  await expect(chip).toContainText("garden");

  await chip.click({ button: "right" });
  await waitForCommand(page, "seed", () =>
    page.getByRole("menuitem", { name: "Seed repository" }).click(),
  );
  await expect(
    page.getByRole("navigation").getByRole("link", { name: /garden/ }),
  ).toBeVisible({ timeout: 20_000 });
});

test("a link to a repo that isn't here can be seeded without an explorer page", async ({
  page,
  peerManager,
}) => {
  const { bob, eve } = await createCollaborators(peerManager);
  const { rid: garden } = await createRepo(eve, { name: "garden" });
  await bob.startHttpd();
  await useBackend(page, bob);
  await openIssue(page, bob);

  await commentBox(page).fill(
    `[garden tree](${garden}/tree/${"f".repeat(40)})`,
  );
  await comment(page);
  await reload(page);

  await rendered(page)
    .last()
    .locator("a", { hasText: "garden tree" })
    .click({ button: "right" });
  await expect(page.getByRole("menuitem")).toHaveText([
    "Copy rad: URI",
    "Seed repository",
  ]);
  await waitForCommand(page, "seed", () =>
    page.getByRole("menuitem", { name: "Seed repository" }).click(),
  );
  await expect(
    page.getByRole("navigation").getByRole("link", { name: /garden/ }),
  ).toBeVisible({ timeout: 20_000 });
});
