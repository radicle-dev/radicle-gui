import { test, cobUrl, expect } from "@tests/support/fixtures.js";
import {
  createContributor,
  createRepo,
  radArtifact,
  registerArtifact,
  syncFrom,
} from "@tests/support/repo.js";
import { releaseApiOnlyLocal, useLocalHttpd } from "@tests/support/support.js";

test.describe(() => {
  test.skip(!useLocalHttpd, releaseApiOnlyLocal);
  // Release fixtures need several rad-artifact commands, which takes longer
  // than the default per-test budget.
  test.describe.configure({ timeout: 30_000 });

  test("navigate release listing", async ({ page, peer }) => {
    const { rid, repoFolder } = await createRepo(peer, {
      name: "release-listing",
    });
    await registerArtifact(peer, repoFolder, { name: "binary" });

    await page.goto(`${peer.uiUrl()}/${rid}`);
    await page.getByRole("link", { name: "Releases 1" }).click();
    await expect(page).toHaveURL(`${peer.uiUrl()}/${rid}/releases`);

    // The release COB has no title; it falls back to the commit summary.
    await expect(
      page.locator(".release-teaser").getByText("initial commit"),
    ).toBeVisible();
  });

  test("filter releases by author", async ({ page, peer, peerManager }) => {
    const name = "release-authors";
    const { rid, repoFolder } = await createRepo(peer, { name });
    await registerArtifact(peer, repoFolder, { name: "delegate-binary" });

    // Eve isn't a delegate, so her release is out of scope by default.
    const { contributor, repoFolder: contributorFolder } =
      await createContributor(peerManager, peer, { rid, repoName: name });
    // A release is keyed by a commit, so Eve needs a commit of her own in
    // storage to open one.
    await contributor.git(
      ["commit", "--allow-empty", "--message", "eve commit"],
      { cwd: contributorFolder },
    );
    await contributor.git(["push", "rad", "HEAD:refs/heads/eve"], {
      cwd: contributorFolder,
    });
    const { stdout: eveHead } = await contributor.git(["rev-parse", "HEAD"], {
      cwd: contributorFolder,
    });
    await registerArtifact(contributor, contributorFolder, {
      name: "eve-binary",
      revision: eveHead,
    });
    await syncFrom(peer, repoFolder);

    await page.goto(`${peer.uiUrl()}/${rid}/releases`);
    await expect(page.locator(".release-teaser")).toHaveCount(1);
    await expect(page.getByText("eve commit")).toBeHidden();

    await page.getByRole("link", { name: "All 2" }).click();
    await expect(page).toHaveURL(
      `${peer.uiUrl()}/${rid}/releases?allAuthors=true`,
    );
    await expect(page.locator(".release-teaser")).toHaveCount(2);
    await expect(page.getByText("eve commit")).toBeVisible();

    await page.getByRole("link", { name: "Delegates 1" }).click();
    await expect(page).toHaveURL(`${peer.uiUrl()}/${rid}/releases`);
    await expect(page.locator(".release-teaser")).toHaveCount(1);
  });

  test("empty release listing", async ({ page, peer }) => {
    const { rid } = await createRepo(peer, { name: "no-releases" });

    await page.goto(`${peer.uiUrl()}/${rid}/releases`);
    await expect(page.getByText("No releases", { exact: true })).toBeVisible();
  });

  test("hide fully redacted releases", async ({ page, peer }) => {
    const { rid, repoFolder } = await createRepo(peer, {
      name: "redacted-release",
    });
    const { releaseId, cid } = await registerArtifact(peer, repoFolder, {
      name: "binary",
    });
    await radArtifact(peer, repoFolder, [
      "redact",
      "--release",
      releaseId,
      "--cid",
      cid,
      "--reason",
      "Compromised build",
    ]);

    await page.goto(`${peer.uiUrl()}/${rid}/releases`);
    await expect(page.getByText("No releases", { exact: true })).toBeVisible();

    // The tab counter comes from the repo metadata, which counts every release
    // COB, redacted or not.
    await expect(page.getByRole("link", { name: "Releases 1" })).toBeVisible();
  });
});

test("releases are unavailable on older nodes", async ({ page }) => {
  test.skip(useLocalHttpd, "older nodes are the pre-built httpd release");

  await page.goto(cobUrl);
  await expect(page.getByRole("link", { name: /^Releases/ })).toBeHidden();

  await page.goto(`${cobUrl}/releases`);
  await expect(
    page.getByText("Releases are not available on this node"),
  ).toBeVisible();
});
