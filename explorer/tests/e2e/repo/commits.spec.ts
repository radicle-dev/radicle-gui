import {
  aliceMainCommitCount,
  aliceMainCommitMessage,
  bobMainCommitCount,
  commitsUrl,
  expect,
  gitOptions,
  shortAliceHead,
  shortBobHead,
  sourceBrowsingUrl,
  test,
} from "@tests/support/fixtures.js";
import { changeBranch, createRepo } from "@tests/support/repo";

test("peer and branch switching", async ({ page }) => {
  await page.goto(sourceBrowsingUrl);
  await page
    .getByRole("link", { name: `Commits ${aliceMainCommitCount}` })
    .click();
  await expect(page.getByText("Thursday, December 15,")).toBeVisible();

  // Alice's peer.
  {
    await changeBranch("alice", `main ${shortAliceHead}`, page);

    await expect(
      page.locator('[title="Change branch"]:visible').first(),
    ).toHaveText("alice Delegate / main");

    await expect(page.getByText("Thursday, November 17, 2022")).toBeVisible();
    await expect(page.locator(".list .teaser")).toHaveCount(
      aliceMainCommitCount,
    );

    const latestCommit = page.locator(".teaser").first();
    await expect(latestCommit).toContainText(aliceMainCommitMessage);
    await expect(latestCommit).toContainText(shortAliceHead);

    const earliestCommit = page.locator(".teaser").last();
    await expect(earliestCommit).toContainText(
      "Initialize an empty git repository",
    );
    await expect(earliestCommit).toContainText("36d5bbe");

    await changeBranch("alice", "feature/branch", page);

    await expect(
      page.getByRole("button", { name: "feature/branch" }),
    ).toBeVisible();
    await expect(page.getByText("Thursday, November 17, 2022")).toBeVisible();
    await expect(page.locator(".list .teaser")).toHaveCount(bobMainCommitCount);

    await changeBranch("alice", "orphaned-branch", page);

    await expect(
      page.getByRole("button", { name: "orphaned-branch" }),
    ).toBeVisible();
    await expect(page.getByText("Thursday, November 17, 2022")).toBeVisible();
    await expect(page.locator(".list")).toHaveCount(1);
  }

  // Bob's peer.
  {
    await changeBranch("bob", `main ${shortBobHead}`, page);

    await expect(
      page.locator('[title="Change branch"]:visible').first(),
    ).toContainText("bob");

    await expect(page.getByText("Wednesday, December 21, 2022")).toBeVisible();
    await expect(page.locator(".list").first().locator(".teaser")).toHaveCount(
      1,
    );

    await expect(page.getByText("Thursday, November 17, 2022")).toBeVisible();
    await expect(page.locator(".list").last().locator(".teaser")).toHaveCount(
      7,
    );

    const latestCommit = page.locator(".teaser").first();
    await expect(latestCommit).toContainText("Update readme");
    await expect(latestCommit).toContainText(shortBobHead);

    const earliestCommit = page.locator(".teaser").last();
    await expect(earliestCommit).toContainText(
      "Initialize an empty git repository",
    );
    await expect(earliestCommit).toContainText("36d5bbe");
  }
});

test("loading more commits, adds them to the commits list", async ({
  page,
}) => {
  await page.goto(commitsUrl);
  await page.getByRole("button", { name: "Commits" }).click();
  await expect(page.locator("div > div > .teaser")).toHaveCount(30);

  await page.getByRole("button", { name: "More" }).click();
  await expect(page.locator("div > div > .teaser")).toHaveCount(31);
});

test("commit messages with double colon not converted into single colon", async ({
  page,
}) => {
  const commitMessage = "Verify that crate::DoubleColon::should_work()";
  const shortCommit = "7babd25";
  await page.goto(sourceBrowsingUrl);
  await page
    .getByRole("link", { name: `Commits ${aliceMainCommitCount}` })
    .click();

  await expect(
    page.getByRole("button", {
      name: `${shortCommit} ${commitMessage}`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: commitMessage,
      exact: true,
    }),
  ).toBeVisible();

  await page
    .getByRole("link", {
      name: commitMessage,
      exact: true,
    })
    .click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(commitMessage, { exact: true })).toBeVisible();
});

test("expand commit message", async ({ page }) => {
  await page.goto(sourceBrowsingUrl);
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("link", { name: `Commits ${aliceMainCommitCount}` })
    .click();
  const commitToggle = page.getByRole("button", { name: "expand" }).first();

  await commitToggle.click();
  const expandedCommit = page.getByText(
    "This shouldn't replace double colons with simple colons",
  );

  await expect(expandedCommit).toBeVisible();
  await commitToggle.click();

  await expect(expandedCommit).toBeHidden();
});

test("relative timestamps", async ({ page }) => {
  await page.clock.setFixedTime(new Date("December 21 2022 12:00:00"));
  await page.goto(sourceBrowsingUrl);
  await page
    .getByRole("link", { name: `Commits ${aliceMainCommitCount}` })
    .click();
  await expect(page.getByText("Thursday, December 15,")).toBeVisible();

  await changeBranch("bob", `main ${shortBobHead}`, page);
  await expect(
    page.locator('[title="Change branch"]:visible').first(),
  ).toHaveText(/bob/);
  const latestCommit = page.locator(".teaser").first();
  await expect(latestCommit).toContainText(
    `Bob Belcher committed ${shortBobHead} now`,
  );
  await expect(latestCommit).toContainText(shortBobHead);
  const earliestCommit = page.locator(".teaser").last();
  await expect(earliestCommit).toContainText(
    "Alice Liddell committed 36d5bbe last month",
  );
});

test("pushing changes while viewing history", async ({ page, peerManager }) => {
  const alice = await peerManager.createPeer({
    name: "alice",
    gitOptions: gitOptions["alice"],
  });
  await alice.startNode();
  await alice.startHttpd();
  const { rid, repoFolder } = await createRepo(alice, {
    name: "alice-project",
  });
  await page.goto(`${alice.uiUrl()}/${rid}`);
  await page.getByRole("link", { name: "Commits 1" }).click();
  await expect(page).toHaveURL(`${alice.uiUrl()}/${rid}/history`);

  await alice.git(["commit", "--allow-empty", "--message", "first change"], {
    cwd: repoFolder,
  });
  await alice.git(["push", "rad", "main"], {
    cwd: repoFolder,
  });
  await page.reload();
  await expect(page).toHaveURL(`${alice.uiUrl()}/${rid}/history`);
  await expect(page.getByRole("link", { name: "Commits 2" })).toBeVisible();

  await expect(
    page.locator('[title="Change branch"]:visible').first(),
  ).toHaveText("main Canonical");
  const branchSelectorCommitButton = page.getByTitle("Current HEAD").first();
  await expect(branchSelectorCommitButton).toHaveText("516fa74 first change");

  await page.getByRole("link", { name: "alice-project" }).nth(1).click();
  await expect(page).toHaveURL(`${alice.uiUrl()}/${rid}`);
  await page.getByRole("link", { name: "Commits 2" }).click();

  await alice.git(
    [
      "commit",
      "--allow-empty",
      "--message",
      "after clicking the project title",
    ],
    {
      cwd: repoFolder,
    },
  );
  await alice.git(["push", "rad", "main"], {
    cwd: repoFolder,
  });
  await page.reload();
  await expect(page).toHaveURL(`${alice.uiUrl()}/${rid}/history`);
  await expect(page.getByRole("link", { name: "Commits 3" })).toHaveText(
    "Commits 3",
  );
  await expect(
    page.getByRole("button", { name: "main Canonical" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "bb9089a after clicking the" }),
  ).toBeVisible();
});
