import type { Browser, Page } from "@playwright/test";
import type { RadiclePeer } from "@tests/support/peerManager.js";

import * as Fs from "node:fs/promises";
import * as Path from "node:path";

import * as patch from "@tests/support/cobs/patch.js";
import {
  clone,
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

const TITLE = "The notes are too quiet";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("labs.boards", "true"));
});

const WRITES = [
  "/create_board",
  "/update_board",
  "/rename_board",
  "/set_board_columns",
  "/edit_issue",
  "/seed",
];

function column(page: Page, id: string) {
  return page.locator(`[data-column="${id}"]`);
}

function card(page: Page, title = TITLE) {
  return page.locator(".card").filter({ hasText: title });
}

function modal(page: Page) {
  return page.locator("[data-modal-content]");
}

async function moveTo(page: Page, columnName: string, title = TITLE) {
  await card(page, title).click({ button: "right" });
  await page.getByRole("menuitem", { name: columnName, exact: true }).click();
}

// Counts the writes the page sends from now on.
function countWrites(page: Page): () => number {
  let writes = 0;
  page.on("request", request => {
    if (WRITES.includes(new URL(request.url()).pathname)) writes++;
  });
  return () => writes;
}

async function openBoardMenu(page: Page) {
  await page.getByRole("button", { name: "Board actions" }).click();
}

// Confirms the "Create board" prompt the page shows for a repository without
// a board.
async function createBoard(page: Page) {
  await waitForCommand(page, "create_board", async () => {
    await page.getByRole("button", { name: "Create board" }).first().click();
    await page
      .getByRole("button", { name: "icon-dashboard Create", exact: true })
      .click();
  });
  await expect(page.getByText("This repository has no board yet.")).toHaveCount(
    0,
  );
}

// Puts the open issue of the repository "other" on the board, through the
// board menu.
async function addCardFromOther(page: Page) {
  await openBoardMenu(page);
  await page
    .getByRole("menuitem", { name: "Add card from another repository" })
    .click();
  await modal(page).locator(".option").filter({ hasText: "other" }).click();
  await waitForCommand(page, "update_board", () =>
    modal(page).locator(".option").filter({ hasText: TITLE }).click(),
  );
}

// The card from the repository `rid`, told apart by its repository chip.
function cardFrom(page: Page, rid: string) {
  return page
    .locator(".card")
    .filter({ has: page.locator(`[title="${rid}"]`) });
}

// A page talking to `peer`, in its own browser context so a test can look at
// the same repository as two people.
async function pageFor(browser: Browser, peer: RadiclePeer): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("appFirstLaunch", "false");
    localStorage.setItem("labs.boards", "true");
  });
  await useBackend(page, peer);
  return page;
}

// A patch by `peer` that links to `issueId` with a keyword and the issue's
// full reference.
async function linkingPatch(
  peer: RadiclePeer,
  rid: string,
  repoFolder: string,
  issueId: string,
) {
  const file = Path.join(repoFolder, "notes.txt");
  return patch.create(
    peer,
    ["Turn the notes up"],
    "feature/louder",
    () => Fs.writeFile(file, "ONE\ntwo\nthree\nfour\nfive\n"),
    ["Turn the notes up", `Fixes ${rid}/cob/xyz.radicle.issue/${issueId}`],
    { cwd: repoFolder },
  );
}

test("boards stay hidden until turned on in Labs", async ({ page, peer }) => {
  await page.addInitScript(() => localStorage.removeItem("labs.boards"));
  const { rid } = await createProject(peer);
  await page.goto(`/repos/${rid}/board`);
  await expect(page.locator("[data-column]")).toHaveCount(0);
  await expect(page.getByText("This repository has no board yet.")).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /Boards$/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Settings" }).click();
  await page
    .locator(".row")
    .filter({ hasText: "Arrange issues and patches on a board" })
    .getByRole("button", { name: "On" })
    .click();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: /Boards$/ }).click();
  await expect(
    page.getByText("This repository has no board yet."),
  ).toBeVisible();
});

test("creating a board asks for confirmation", async ({ page, peer }) => {
  const { rid } = await createProject(peer);
  await page.goto(`/repos/${rid}/board`);
  await expect(
    page.getByText("This repository has no board yet."),
  ).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  const writes = countWrites(page);

  await page.getByRole("button", { name: "Create board" }).first().click();
  await expect(modal(page).getByText("Create board")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByText("This repository has no board yet."),
  ).toBeVisible();
  expect(writes()).toBe(0);

  await createBoard(page);
  await reload(page);
  await expect(page.getByText("This repository has no board yet.")).toHaveCount(
    0,
  );
  await expect(card(page)).not.toHaveAttribute("title", /.+/);
});

test("a moved card is saved after a pause", async ({ page, peer }) => {
  const { rid } = await createProject(peer);
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);
  await expect(column(page, "backlog").getByText(TITLE)).toBeVisible();

  await waitForCommand(page, "update_board", () => moveTo(page, "Todo"));
  await reload(page);

  await expect(column(page, "todo").getByText(TITLE)).toBeVisible();
});

test("moves that cancel out aren't written", async ({ page, peer }) => {
  const { rid } = await createProject(peer);
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);
  await waitForCommand(page, "update_board", () => moveTo(page, "Todo"));

  const writes = countWrites(page);
  await moveTo(page, "In Progress");
  await expect(column(page, "in-progress").getByText(TITLE)).toBeVisible();
  await moveTo(page, "Todo");
  await expect(column(page, "todo").getByText(TITLE)).toBeVisible();
  // Longer than the pause before a write.
  await page.waitForTimeout(4000);

  expect(writes()).toBe(0);
});

test("a pending move is saved when leaving the board", async ({
  page,
  peer,
}) => {
  const { rid } = await createProject(peer);
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);
  await expect(column(page, "backlog").getByText(TITLE)).toBeVisible();

  await waitForCommand(page, "update_board", async () => {
    await moveTo(page, "Todo");
    await page.getByRole("link", { name: "Issues" }).click();
  });
  await goto(page, `/repos/${rid}/board`);

  await expect(column(page, "todo").getByText(TITLE)).toBeVisible();
});

test("a board can be renamed and its columns edited", async ({
  page,
  peer,
}) => {
  const { rid } = await createProject(peer);
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);

  await openBoardMenu(page);
  await page.getByRole("menuitem", { name: "Edit columns" }).click();
  await waitForCommand(page, "set_board_columns", async () => {
    await page.getByLabel("Column name").first().fill("Inbox");
    await page.getByRole("button", { name: "Save" }).click();
  });
  await expect(column(page, "backlog").getByText("Inbox")).toBeVisible();

  // A second board gets the picker and the rename entry.
  await waitForCommand(page, "create_board", async () => {
    await openBoardMenu(page);
    await page.getByRole("menuitem", { name: "Create board" }).click();
    await page
      .getByRole("button", { name: "icon-dashboard Create", exact: true })
      .click();
  });
  await expect(page.getByRole("button", { name: "Board 2" })).toBeVisible();

  await page.getByRole("button", { name: "Board 2" }).click();
  await page.getByRole("menuitem", { name: "Rename board" }).click();
  await waitForCommand(page, "rename_board", async () => {
    await page.getByPlaceholder("Board name").fill("Roadmap");
    await page.getByRole("button", { name: "Rename" }).click();
  });
  await expect(page.getByRole("button", { name: "Roadmap" })).toBeVisible();

  await reload(page);
  await expect(page.getByRole("button", { name: "Roadmap" })).toBeVisible();
  await page.getByRole("button", { name: "Roadmap" }).click();
  await page.getByRole("menuitem", { name: "Board", exact: true }).click();
  await expect(column(page, "backlog").getByText("Inbox")).toBeVisible();
});

test("a delegate closes an issue by moving it to Done and reopens it by moving it out", async ({
  page,
  peer,
}) => {
  const { rid } = await createProject(peer);
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);

  await waitForCommand(page, "edit_issue", () => moveTo(page, "Done"));
  await goto(page, `/repos/${rid}/issues?status=closed`);
  await expect(page.getByText(TITLE)).toBeVisible();

  await goto(page, `/repos/${rid}/board`);
  await expect(column(page, "done").getByText(TITLE)).toBeVisible();
  await waitForCommand(page, "edit_issue", () => moveTo(page, "Todo"));
  await goto(page, `/repos/${rid}/issues?status=open`);
  await expect(page.getByText(TITLE)).toBeVisible();

  await goto(page, `/repos/${rid}/board`);
  await expect(column(page, "todo").getByText(TITLE)).toBeVisible();
});

test("an assignee moves between open columns only", async ({
  page,
  browser,
  peerManager,
}) => {
  const { bob, eve } = await createCollaborators(peerManager);
  const { rid, repoFolder, issueId } = await createProject(bob);
  await bob.rad(
    ["issue", "assign", issueId, "--add", `did:key:${eve.nodeId}`],
    { cwd: repoFolder },
  );
  await bob.startHttpd();
  await useBackend(page, bob);
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);

  await clone(eve, rid);
  await eve.startHttpd();
  const evePage = await pageFor(browser, eve);
  await evePage.goto(`/repos/${rid}/board`);
  await expect(card(evePage)).not.toHaveAttribute("title", /.+/);

  await card(evePage).click({ button: "right" });
  await expect(evePage.getByRole("menuitem", { name: "Todo" })).toBeVisible();
  await expect(evePage.getByRole("menuitem", { name: "Done" })).toHaveCount(0);
  await expect(evePage.getByRole("menuitem", { name: "Canceled" })).toHaveCount(
    0,
  );
  await waitForCommand(evePage, "update_board", () =>
    evePage.getByRole("menuitem", { name: "Todo", exact: true }).click(),
  );
  await reload(evePage);
  await expect(column(evePage, "todo").getByText(TITLE)).toBeVisible();
});

test("a contributor can't create a board", async ({ page, peerManager }) => {
  const { bob, eve } = await createCollaborators(peerManager);
  const { rid } = await createProject(bob);
  await clone(eve, rid);
  await eve.startHttpd();
  await useBackend(page, eve);

  await page.goto(`/repos/${rid}/board`);

  await expect(
    page.getByText("This repository has no board yet."),
  ).toBeVisible();
  await expect(page.getByText("A delegate can create one.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create board" })).toHaveCount(
    0,
  );
  await expect(card(page)).toHaveCount(0);
});

test("a linked patch shows as a chip on the issue's card", async ({
  page,
  peer,
}) => {
  const { rid, repoFolder, issueId } = await createProject(peer);
  const patchId = await linkingPatch(peer, rid, repoFolder, issueId);
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);

  const chip = card(page).locator(".patch-chip");
  await expect(chip).toHaveText(patchId.slice(0, 7));
  await expect(column(page, "in-review").getByText(TITLE)).toBeVisible();
  await expect(
    page.locator(".card").filter({ hasText: "Turn the notes up" }),
  ).toHaveCount(0);
});

test("opening a board writes nothing", async ({ page, peer }) => {
  const { rid, repoFolder, issueId } = await createProject(peer);
  await linkingPatch(peer, rid, repoFolder, issueId);
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);
  await waitForCommand(page, "update_board", () => moveTo(page, "Todo"));

  // A merged linked patch used to close the issue on the next visit.
  await patch.merge(peer, "main", "feature/louder", { cwd: repoFolder });
  const writes = countWrites(page);
  await reload(page);
  await expect(column(page, "todo").getByText(TITLE)).toBeVisible();
  await page.waitForTimeout(4000);

  expect(writes()).toBe(0);
  await goto(page, `/repos/${rid}/issues?status=open`);
  await expect(page.getByText(TITLE)).toBeVisible();
});

test("seeding a card's repository asks for confirmation", async ({
  page,
  browser,
  peerManager,
}) => {
  const { bob, eve } = await createCollaborators(peerManager);
  const { rid } = await createProject(bob);
  await createProject(bob, "other");
  await bob.startHttpd();
  await useBackend(page, bob);
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);

  await openBoardMenu(page);
  await page
    .getByRole("menuitem", { name: "Add card from another repository" })
    .click();
  await modal(page).locator(".option").filter({ hasText: "other" }).click();
  await waitForCommand(page, "update_board", () =>
    modal(page).locator(".option").filter({ hasText: TITLE }).click(),
  );

  await clone(eve, rid);
  await eve.startHttpd();
  const evePage = await pageFor(browser, eve);
  await evePage.goto(`/repos/${rid}/board`);
  const unresolved = evePage.locator(".card").filter({
    hasText: "Click to seed this repository",
  });
  await expect(unresolved).toBeVisible();
  const writes = countWrites(evePage);

  await unresolved.click();
  await expect(modal(evePage).getByText("Seed repository")).toBeVisible();
  await evePage.getByRole("button", { name: "Cancel" }).click();
  await expect(unresolved).toBeVisible();
  expect(writes()).toBe(0);
});

test("a card from another repository can be added", async ({ page, peer }) => {
  const { rid } = await createProject(peer);
  const { rid: other } = await createProject(peer, "other");
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);

  await addCardFromOther(page);
  await reload(page);

  await expect(column(page, "backlog").locator(".card")).toHaveCount(3);
  await expect(cardFrom(page, other)).toHaveCount(1);
  await expect(cardFrom(page, other)).toContainText(TITLE);
  await expect(cardFrom(page, other)).toContainText("other");
});

test("a card can be removed from the board", async ({ page, peer }) => {
  const { rid } = await createProject(peer);
  const { rid: other } = await createProject(peer, "other");
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);
  await addCardFromOther(page);
  await expect(cardFrom(page, other)).toBeVisible();

  await cardFrom(page, other).click({ button: "right" });
  await waitForCommand(page, "update_board", () =>
    page.getByRole("menuitem", { name: "Remove from board" }).click(),
  );
  await reload(page);

  await expect(cardFrom(page, other)).toHaveCount(0);
  await expect(column(page, "backlog").getByText(TITLE)).toBeVisible();
});

test("a priority can be set from the card menu", async ({ page, peer }) => {
  const { rid } = await createProject(peer);
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);
  await expect(card(page).locator('[title="No priority"]')).toBeVisible();

  await card(page).click({ button: "right" });
  await waitForCommand(page, "edit_issue", () =>
    page.getByRole("menuitem", { name: "High" }).click(),
  );
  await expect(card(page).locator('[title="High"]')).toBeVisible();

  await reload(page);
  await expect(card(page).locator('[title="High"]')).toBeVisible();
});

test("reordering a closed issue doesn't change its state", async ({
  page,
  peer,
}) => {
  const { rid, repoFolder, issueId } = await createProject(peer);
  // Closed as "other", which the board then has no column for.
  await peer.rad(["issue", "state", issueId, "--closed"], { cwd: repoFolder });
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);
  await openBoardMenu(page);
  await page.getByRole("menuitem", { name: "Edit columns" }).click();
  await waitForCommand(page, "set_board_columns", async () => {
    await page.getByTitle("Delete column").last().click();
    await page.getByRole("button", { name: "Save" }).click();
  });
  await expect(column(page, "done").getByText(TITLE)).toBeVisible();

  let lifecycle = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/edit_issue") lifecycle++;
  });
  // The column the card is in carries a checkmark, so its name isn't exact.
  await waitForCommand(page, "update_board", async () => {
    await card(page).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Done" }).click();
  });
  await page.waitForTimeout(1000);

  expect(lifecycle).toBe(0);
  await goto(page, `/repos/${rid}/issues?status=closed`);
  await expect(page.getByText(TITLE)).toBeVisible();
  await goto(page, `/repos/${rid}/board`);
  await expect(column(page, "done").getByText(TITLE)).toBeVisible();
});

test("a write the backend rejects shows the error notice", async ({
  page,
  peer,
}) => {
  const { rid } = await createProject(peer);
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);
  await page.route("**/update_board", route =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ code: "BoardError", message: "Not saved" }),
    }),
  );

  await moveTo(page, "Todo");

  await expect(
    page.getByText("The board couldn't be saved: Not saved"),
  ).toBeVisible();
  await expect(column(page, "backlog").getByText(TITLE)).toBeVisible();
});

test("view settings survive a reload", async ({ page, peer }) => {
  const { rid } = await createProject(peer);
  await page.goto(`/repos/${rid}/board`);
  await createBoard(page);
  await expect(column(page, "done")).toBeVisible();

  await page.getByRole("button", { name: "Display" }).click();
  // The styled box covers the native checkbox, so click its label.
  await page.getByText("Show completed", { exact: true }).click();
  await expect(page.getByLabel("Show completed")).not.toBeChecked();
  await expect(column(page, "done")).toHaveCount(0);
  await page.getByRole("button", { name: "Display" }).click();

  await reload(page);
  await expect(column(page, "backlog")).toBeVisible();
  await expect(column(page, "done")).toHaveCount(0);
});
