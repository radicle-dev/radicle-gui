import {
  aliceRemote,
  bobHead,
  expect,
  shortBobHead,
  sourceBrowsingUrl,
  test,
} from "@tests/support/fixtures.js";
import { changeBranch } from "@tests/support/repo";

const commitUrl = `${sourceBrowsingUrl}/commits/${bobHead}`;

test("navigation from commit list", async ({ page }) => {
  await page.goto(sourceBrowsingUrl);
  await changeBranch("bob", `main ${shortBobHead}`, page);

  await page.getByRole("link", { name: "Update readme" }).first().click();
  await expect(page).toHaveURL(commitUrl);
});

test("relative timestamps", async ({ page }) => {
  await page.clock.setFixedTime(new Date("December 21 2022 12:00:00"));
  await page.goto(commitUrl);
  await expect(
    page.getByText(`Bob Belcher committed ${shortBobHead}`),
  ).toBeVisible();
});

test("modified file", async ({ page }) => {
  await page.goto(commitUrl);

  // Commit header.
  {
    await expect(page.getByText("Update readme")).toBeVisible();
    await expect(page.getByLabel("commit-id")).toHaveText(shortBobHead);
  }

  // Diff header.
  await expect(
    page.getByText("1 file modified with 1 insertion and 4 deletions"),
  ).toBeVisible();

  // Diff.
  await expect(page.getByText("# Git test repository")).toBeVisible();
  await expect(page.getByText("Updated readme")).toBeVisible();
});

test("created file", async ({ page }) => {
  await page.goto(
    `${sourceBrowsingUrl}/remotes/${aliceRemote.substring(
      8,
    )}/commits/d87e27e38e244fb3346cb9e4df064c080d97647a`,
  );
  await expect(
    page.getByText("1 file added with 1 insertion and 0 deletions"),
  ).toBeVisible();
  await expect(page.getByText(".hidden added")).toBeVisible();
});

test("deleted file", async ({ page }) => {
  await page.goto(
    `${sourceBrowsingUrl}/remotes/${aliceRemote.substring(
      8,
    )}/commits/0e2db54dfd47d87202809917e2342655d9e76296`,
  );
  await expect(
    page.getByText("1 file deleted with 0 insertions and 1 deletion"),
  ).toBeVisible();
  await expect(page.getByText(".hidden deleted")).toBeVisible();
});

test("moved file", async ({ page }) => {
  await page.goto(
    `${sourceBrowsingUrl}/remotes/${aliceRemote}/commits/f48a1056a5bd02277978f6e8a00517a967546340`,
  );
  await expect(
    page.getByText("moves/111.txt → moves/222.txt moved"),
  ).toBeVisible();
  await expect(page.getByText("333")).toBeVisible();
});

test("copied file", async ({ page }) => {
  await page.goto(
    `${sourceBrowsingUrl}/remotes/${aliceRemote}/commits/f48a1056a5bd02277978f6e8a00517a967546340`,
  );
  await expect(
    page.getByText("copies/aaa.txt → copies/aaa_copy.txt copied"),
  ).toBeVisible();
});

test("binary file detection in diffs", async ({ page }) => {
  await page.goto(
    `${sourceBrowsingUrl}/commits/335dd6dc89b535a4a31e9422c803199bb6b0a09a`,
  );
  await expect(page.getByText("Binary file")).toBeVisible();
});

test("navigation to source tree at specific revision", async ({ page }) => {
  await page.goto(
    `${sourceBrowsingUrl}/commits/0801aceeab500033f8d608778218657bd626ef73`,
  );

  // Go to source tree at this revision.
  await page.getByTitle("View file at this commit").click();
  const branchSelectorCommitButton = page.getByTitle("Current HEAD").first();
  await expect(branchSelectorCommitButton).toContainText("0801ace");
  await expect(page).toHaveURL(
    `${sourceBrowsingUrl}/tree/0801aceeab500033f8d608778218657bd626ef73/deep/directory/hierarchy/is/entirely/possible/in/git/repositories/.gitkeep`,
  );
  await expect(page.locator(".source-tree >> text=.gitkeep")).toBeVisible();
  await expect(
    page
      .locator(
        "text=deep/directory/hierarchy/is/entirely/possible/in/git/repositories/",
      )
      .nth(1),
  ).toBeVisible();
});
