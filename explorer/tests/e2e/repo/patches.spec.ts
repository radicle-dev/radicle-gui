import { test, cobUrl, expect } from "@tests/support/fixtures.js";
import { createRepo } from "@tests/support/repo";

test("navigate patch listing", async ({ page }) => {
  await page.goto(cobUrl);
  await page.getByRole("link", { name: "Patches 2" }).click();
  await expect(page).toHaveURL(`${cobUrl}/patches`);

  await page.getByRole("link", { name: "Merged" }).click();
  await expect(page).toHaveURL(`${cobUrl}/patches?status=merged`);
  await expect(
    page.locator(".comments").filter({ hasText: "5" }),
  ).toBeVisible();
});

test("patches counters", async ({ page, peer }) => {
  const { rid, repoFolder, defaultBranch } = await createRepo(peer, {
    name: "patch-counters",
  });
  await peer.git(["switch", "-c", "feature-1"], {
    cwd: repoFolder,
  });
  await peer.git(["commit", "--allow-empty", "-m", "1th"], {
    cwd: repoFolder,
  });
  await peer.git(["push", "rad", "HEAD:refs/patches"], {
    cwd: repoFolder,
  });
  await page.goto(`${peer.uiUrl()}/${rid}/patches`);
  await peer.git(["switch", defaultBranch], {
    cwd: repoFolder,
  });
  await peer.git(["switch", "-c", "feature-2"], {
    cwd: repoFolder,
  });
  await peer.git(["commit", "--allow-empty", "-m", "2nd"], {
    cwd: repoFolder,
  });
  await peer.git(["push", "rad", "HEAD:refs/patches"], {
    cwd: repoFolder,
  });
  await page.getByRole("link", { name: "Open" }).first().click();
  await expect(page.getByRole("button", { name: "Patches 2" })).toBeVisible();
  await expect(page.locator(".patch-teaser")).toHaveCount(2);
});
