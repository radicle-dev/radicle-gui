import { test, expect } from "@tests/support/fixtures.js";
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

  test("navigate single release", async ({ page, peer }) => {
    const { rid, repoFolder } = await createRepo(peer, {
      name: "single-release",
    });
    const { releaseId } = await registerArtifact(peer, repoFolder, {
      name: "binary",
    });

    await page.goto(`${peer.uiUrl()}/${rid}/releases`);
    await page.locator(".release-teaser").getByText("initial commit").click();

    await expect(page).toHaveURL(
      `${peer.uiUrl()}/${rid}/releases/${releaseId}`,
    );
    await expect(page.locator(".artifact-name")).toContainText("binary");
  });

  test("release title and tag name come from the tag", async ({
    page,
    peer,
  }) => {
    const { rid, repoFolder } = await createRepo(peer, {
      name: "tagged-release",
    });
    await peer.git(["tag", "--annotate", "v1.0", "--message", "Version 1.0"], {
      cwd: repoFolder,
    });
    // rad-artifact resolves revisions in Radicle storage, where refs are
    // namespaced per node, so push the tag and address it by object id.
    await peer.git(["push", "rad", "--tags"], { cwd: repoFolder });
    const { stdout: tagOid } = await peer.git(["rev-parse", "v1.0"], {
      cwd: repoFolder,
    });
    const { releaseId } = await registerArtifact(peer, repoFolder, {
      name: "binary",
      revision: tagOid,
    });

    await page.goto(`${peer.uiUrl()}/${rid}/releases/${releaseId}`);
    await expect(page.locator(".title")).toContainText("Version 1.0");
    await expect(
      page.getByRole("button", { name: "v1.0", exact: true }),
    ).toBeVisible();
  });

  test("artifact download locations", async ({ page, peer }) => {
    const { rid, repoFolder } = await createRepo(peer, {
      name: "release-locations",
    });

    // An artifact with a web location is downloadable straight from the
    // browser.
    const { releaseId, cid } = await registerArtifact(peer, repoFolder, {
      name: "web-artifact",
    });
    await radArtifact(peer, repoFolder, [
      "location",
      "add",
      "--release",
      releaseId,
      "--cid",
      cid,
      "https://example.com/web-artifact",
    ]);

    // An artifact served over the radicle-artifact protocol needs the CLI.
    const { cid: cliCid } = await registerArtifact(peer, repoFolder, {
      name: "cli-artifact",
      release: releaseId,
    });
    await radArtifact(peer, repoFolder, [
      "location",
      "add",
      "--release",
      releaseId,
      "--cid",
      cliCid,
      // A bare radiroh location matches any seeding endpoint.
      "radiroh://",
    ]);

    // An artifact without any location can't be fetched at all.
    await registerArtifact(peer, repoFolder, {
      name: "unavailable-artifact",
      release: releaseId,
    });

    await page.goto(`${peer.uiUrl()}/${rid}/releases/${releaseId}`);

    const webArtifact = page
      .locator(".artifact")
      .filter({ hasText: "web-artifact" });
    await webArtifact.getByRole("button", { name: "Download" }).click();
    await webArtifact.getByRole("button", { name: "Browser" }).click();
    await expect(
      webArtifact.getByRole("link", { name: "Download" }),
    ).toHaveAttribute("href", "https://example.com/web-artifact");

    const cliArtifact = page
      .locator(".artifact")
      .filter({ hasText: "cli-artifact" });
    await cliArtifact.getByRole("button", { name: "Download" }).click();
    await expect(
      cliArtifact.getByRole("button", { name: "Browser" }),
    ).toBeDisabled();
    await expect(cliArtifact.locator(".cmd")).toContainText(
      `rad artifact -r ${rid} download --cid ${cliCid}`,
    );

    await expect(
      page
        .locator(".artifact")
        .filter({ hasText: "unavailable-artifact" })
        .getByRole("button", { name: "Download" }),
    ).toBeDisabled();
  });

  test("show redacted artifacts", async ({ page, peer }) => {
    const { rid, repoFolder } = await createRepo(peer, {
      name: "redacted-artifact",
    });
    const { releaseId } = await registerArtifact(peer, repoFolder, {
      name: "good-artifact",
    });
    const { cid } = await registerArtifact(peer, repoFolder, {
      name: "flagged-artifact",
      release: releaseId,
    });
    await radArtifact(peer, repoFolder, [
      "redact",
      "--release",
      releaseId,
      "--cid",
      cid,
      "--reason",
      "Built from the wrong toolchain",
    ]);

    await page.goto(`${peer.uiUrl()}/${rid}/releases/${releaseId}`);
    await expect(page.getByText("good-artifact")).toBeVisible();
    await expect(page.getByText("flagged-artifact")).toBeHidden();

    await page.getByRole("button", { name: "Show redacted 1" }).click();
    await expect(page.getByText("flagged-artifact")).toBeVisible();
    await page.getByText("1 redaction").click();
    await expect(
      page.getByText("Built from the wrong toolchain"),
    ).toBeVisible();
  });

  test("filter artifacts by author", async ({ page, peer, peerManager }) => {
    const name = "artifact-authors";
    const { rid, repoFolder } = await createRepo(peer, { name });
    const { releaseId } = await registerArtifact(peer, repoFolder, {
      name: "delegate-artifact",
    });

    // Eve isn't a delegate, so her artifact is out of scope by default.
    const { contributor, repoFolder: contributorFolder } =
      await createContributor(peerManager, peer, { rid, repoName: name });
    await registerArtifact(contributor, contributorFolder, {
      name: "eve-artifact",
      release: releaseId,
    });
    await syncFrom(peer, repoFolder);

    await page.goto(`${peer.uiUrl()}/${rid}/releases/${releaseId}`);
    await expect(page.getByText("delegate-artifact")).toBeVisible();
    await expect(page.getByText("eve-artifact")).toBeHidden();

    // The scopes don't overlap: others shows only Eve's artifact.
    await page.getByRole("link", { name: "Others 1" }).click();
    await expect(page).toHaveURL(
      `${peer.uiUrl()}/${rid}/releases/${releaseId}?scope=untrusted`,
    );
    await expect(page.getByText("eve-artifact")).toBeVisible();
    await expect(page.getByText("delegate-artifact")).toBeHidden();

    await page.getByRole("link", { name: "Delegates 1" }).click();
    await expect(page).toHaveURL(
      `${peer.uiUrl()}/${rid}/releases/${releaseId}`,
    );
    await expect(page.getByText("eve-artifact")).toBeHidden();
  });
});
