import type { Page } from "@playwright/test";
import type { PeerManager, RadiclePeer } from "@tests/support/peerManager.js";

import * as Fs from "node:fs/promises";
import * as Path from "node:path";

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
} from "@tests/support/fixtures.js";

const OTHER_DID = "did:key:z6MkkfM3tPXNPrPevKr3uSiQtHPuwnNhu2yUVjgd2jXVsVz5";

test("the commit picker lists commits and rejects unknown SHAs", async ({
  page,
  peer,
}) => {
  const { rid, repoFolder } = await createProject(peer);
  const { stdout: head } = await peer.git(["rev-parse", "main"], {
    cwd: repoFolder,
  });

  await page.goto(`/repos/${rid}/releases`);
  await page.getByRole("button", { name: "New release" }).click();

  const input = page.getByPlaceholder("Pick a commit or paste a SHA");
  await input.click();
  await page.getByText("Add notes").click();
  await expect(input).toHaveValue(head.trim());

  await input.fill("cafecafecafecafecafecafecafecafecafecafe");
  await expect(
    page.getByText("Commit cafecaf is not in this repo."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create release" }),
  ).toBeDisabled();
});

// Fills the New release modal with one artifact, without submitting it.
async function fillRelease(page: Page, peer: RadiclePeer) {
  const { rid, repoFolder } = await createProject(peer);
  const file = Path.join(repoFolder, "build.tar");
  await Fs.writeFile(file, "artifact bytes");
  // The native file dialog only exists under Tauri.
  await page.route(/\/pick_artifact_files$/, route =>
    route.fulfill({ json: [file] }),
  );

  await page.goto(`/repos/${rid}/releases`);
  await page.getByRole("button", { name: "New release" }).click();
  await page.getByPlaceholder("Pick a commit or paste a SHA").click();
  await page.getByText("Add notes").click();
  await page.getByRole("button", { name: "Choose files" }).click();
  return rid;
}

test("creating a release opens it and lists it", async ({ page, peer }) => {
  const rid = await fillRelease(page, peer);
  await page.getByRole("button", { name: "Create release" }).click();

  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));
  await expect(page.getByRole("button", { name: /build\.tar/ })).toBeVisible();
  // The test peer runs no artifact node, so there is nothing to seed with.
  await expect(
    page.getByTitle("Your artifact node is not running"),
  ).toBeDisabled();

  await goto(page, `/repos/${rid}/releases`);
  await expect(page.getByText("Add notes")).toBeVisible();
});

test("a release whose seeding failed still opens", async ({ page, peer }) => {
  await page.route(/\/artifact_node_running$/, route =>
    route.fulfill({ json: true }),
  );
  await page.route(/\/seed_artifact$/, route =>
    route.fulfill({
      status: 500,
      json: { code: "UnknownError", message: "seeding failed" },
    }),
  );
  const rid = await fillRelease(page, peer);
  await page.getByRole("button", { name: "Create release" }).click();

  await expect(
    page.getByText("Registered, but 1 artifact could not be seeded."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeEnabled();
  await page.getByRole("button", { name: "Open release" }).click();

  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));
  await expect(page.getByRole("button", { name: /build\.tar/ })).toBeVisible();
});

test("a release can be deleted", async ({ page, peer }) => {
  const rid = await fillRelease(page, peer);
  await page.getByRole("button", { name: "Create release" }).click();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));

  await page.getByRole("button", { name: "Delete" }).click();
  await page
    .locator("[data-modal-content]")
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases$`));
  await expect(page.getByText("No releases")).toBeVisible();
});

test("re-registering an artifact only signs what changes", async ({
  page,
  peer,
}) => {
  const rid = await fillRelease(page, peer);
  await page.getByRole("button", { name: "Create release" }).click();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));
  const modal = page.locator("[data-modal-content]");

  // The same bytes under the same name change nothing.
  await page.getByRole("button", { name: "Register artifacts" }).click();
  await page.getByRole("button", { name: "Files…" }).click();
  await expect(modal.getByText("Nothing will be registered.")).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "icon-plus Register" }),
  ).toBeHidden();
  await modal.getByRole("button", { name: "Close", exact: true }).click();

  // The same bytes under a new name rename your own artifact.
  const renamed = Path.join(peer.checkoutPath, "renamed.tar");
  await Fs.writeFile(renamed, "artifact bytes");
  await page.route(/\/pick_artifact_files$/, route =>
    route.fulfill({ json: [renamed] }),
  );
  await page.getByRole("button", { name: "Register artifacts" }).click();
  await page.getByRole("button", { name: "Files…" }).click();
  await expect(modal.getByText("renames “build.tar”")).toBeVisible();
  await modal.getByRole("button", { name: "icon-plus Update" }).click();
  await expect(
    page.getByRole("button", { name: /renamed\.tar/ }),
  ).toBeVisible();
});

test("picks with the same contents are registered once", async ({
  page,
  peer,
}) => {
  const rid = await fillRelease(page, peer);
  const copy = Path.join(peer.checkoutPath, "copy.tar");
  await Fs.writeFile(copy, "artifact bytes");
  await page.route(/\/pick_artifact_files$/, route =>
    route.fulfill({ json: [copy] }),
  );
  await page.getByRole("button", { name: "Choose files" }).click();
  await expect(page.getByText("same as “build.tar”")).toBeVisible();
  await page.getByRole("button", { name: "Create release" }).click();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));
  await expect(page.getByRole("button", { name: /build\.tar/ })).toBeVisible();

  // Two new picks with the same contents in one go.
  const first = Path.join(peer.checkoutPath, "a.tar");
  const second = Path.join(peer.checkoutPath, "b.tar");
  await Fs.writeFile(first, "other bytes");
  await Fs.writeFile(second, "other bytes");
  await page.route(/\/pick_artifact_files$/, route =>
    route.fulfill({ json: [first, second] }),
  );
  const modal = page.locator("[data-modal-content]");
  await page.getByRole("button", { name: "Register artifacts" }).click();
  await page.getByRole("button", { name: "Files…" }).click();
  await expect(modal.getByText("same as “a.tar” · skipped")).toBeVisible();
  await modal.getByRole("button", { name: "icon-plus Register" }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByRole("button", { name: /a\.tar/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /b\.tar/ })).toBeHidden();
});

test("a location can be added and removed", async ({ page, peer }) => {
  const rid = await fillRelease(page, peer);
  await page.getByRole("button", { name: "Create release" }).click();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));
  await page.getByRole("button", { name: /build\.tar/ }).click();

  const add = page.getByTitle("Add a URL others can download");
  const input = page.getByPlaceholder("https://…");
  await add.click();
  await input.fill("iroh://abc");
  await input.press("Enter");
  await expect(
    page.getByText("This is not a URL peers can fetch from."),
  ).toBeVisible();

  const url = "https://example.com/build.tar";
  await input.fill(url);
  await input.press("Enter");
  await expect(page.getByText(url)).toBeVisible();

  await page.getByTitle("Remove location").click();
  await page.getByRole("button", { name: "icon-trash Remove" }).click();
  await expect(page.getByText(url)).toBeHidden();
  await expect(page.getByText("No locations")).toBeVisible();
});

test("a location added by someone else cannot be removed", async ({
  page,
  peer,
}) => {
  const rid = await fillRelease(page, peer);
  await page.getByRole("button", { name: "Create release" }).click();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));

  // The test peers run no artifact node, so another user's location is
  // injected into the release the view reads.
  const url = "https://example.com/theirs.tar";
  await page.route(/\/release_by_id$/, async route => {
    const release = await (await route.fetch()).json();
    for (const artifact of release.artifacts) {
      artifact.locations.push({
        user: { did: OTHER_DID },
        url,
      });
    }
    await route.fulfill({ json: release });
  });
  await reload(page);
  await page.getByRole("button", { name: /build\.tar/ }).click();

  await expect(page.getByText(url)).toBeVisible();
  await expect(page.getByTitle("Remove location")).toBeHidden();
});

test("removing your node's location while seeding stops seeding", async ({
  page,
  peer,
}) => {
  const rid = await fillRelease(page, peer);
  await page.getByRole("button", { name: "Create release" }).click();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));
  await page.getByRole("button", { name: /build\.tar/ }).click();
  await page.getByTitle("Add a URL others can download").click();
  await page.getByPlaceholder("https://…").fill("radiroh://");
  const added = page.waitForRequest(/\/add_artifact_location$/);
  await page.getByPlaceholder("https://…").press("Enter");
  const { cid, releaseId } = (await added).postDataJSON();
  await expect(page.getByText("radiroh://")).toBeVisible();

  // The test peers run no artifact node, so it is made to report the
  // artifact as seeded and to accept the unseed.
  await page.route(/\/seeded_artifacts$/, route =>
    route.fulfill({ json: [cid] }),
  );
  const unseed = page.waitForRequest(/\/unseed_artifact$/);
  await page.route(/\/unseed_artifact$/, route =>
    route.fulfill({ json: null }),
  );
  await reload(page);
  await page.getByRole("button", { name: /build\.tar/ }).click();

  await page.getByTitle("Remove location").click();
  await expect(page.getByText("Unseed this artifact?")).toBeVisible();
  await page.getByRole("button", { name: "icon-trash Unseed" }).click();
  expect((await unseed).postDataJSON()).toMatchObject({ releaseId, cid });
});

test("a release by a non-delegate shows a warning", async ({ page, peer }) => {
  const rid = await fillRelease(page, peer);
  await page.getByRole("button", { name: "Create release" }).click();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));
  await expect(page.getByRole("note")).toBeHidden();

  await page.route(/\/release_by_id$/, async route => {
    const release = await (await route.fetch()).json();
    release.creator.did = OTHER_DID;
    await route.fulfill({ json: release });
  });
  await reload(page);

  await expect(
    page.getByRole("note").getByText("Not from a delegate."),
  ).toBeVisible();
});

test("an artifact by a non-delegate shows a warning", async ({
  page,
  peer,
}) => {
  const rid = await fillRelease(page, peer);
  await page.getByRole("button", { name: "Create release" }).click();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));

  // A location makes the download button usable.
  await page.route(/\/release_by_id$/, async route => {
    const release = await (await route.fetch()).json();
    for (const artifact of release.artifacts) {
      artifact.author.did = OTHER_DID;
      artifact.locations.push({
        user: { did: OTHER_DID },
        url: "https://example.com/theirs.tar",
      });
    }
    await route.fulfill({ json: release });
  });
  await reload(page);

  await expect(
    page.getByRole("note").getByText("Not from delegates."),
  ).toBeVisible();
  await page.getByRole("button", { name: "icon-download Download" }).click();
  await expect(page.getByText("Not from a delegate.")).toBeVisible();
});

test("a link by a non-delegate on a delegate's artifact shows a warning", async ({
  page,
  peer,
}) => {
  const rid = await fillRelease(page, peer);
  await page.getByRole("button", { name: "Create release" }).click();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));

  await page.route(/\/release_by_id$/, async route => {
    const release = await (await route.fetch()).json();
    for (const artifact of release.artifacts) {
      artifact.locations.push({
        user: { did: OTHER_DID },
        url: "https://example.com/theirs.tar",
      });
    }
    await route.fulfill({ json: release });
  });
  await reload(page);

  await page.getByRole("button", { name: "icon-download Download" }).click();
  await expect(page.getByText("Not from a delegate.")).toBeHidden();
  await page
    .getByRole("button", { name: "icon-open-external Browser" })
    .click();
  await expect(
    page.getByRole("note").getByText("Links without a delegate badge"),
  ).toBeVisible();
});

test("metadata can be added, edited and removed", async ({ page, peer }) => {
  const rid = await fillRelease(page, peer);
  await page.getByRole("button", { name: "Create release" }).click();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));
  await page.getByRole("button", { name: /build\.tar/ }).click();
  const metadata = page.locator(".section").filter({ hasText: /^Metadata/ });

  await metadata.getByRole("button", { name: "Add" }).click();
  await metadata.getByPlaceholder("Key").fill("arch");
  await metadata.getByPlaceholder("Value").fill("x86_64");
  await metadata.getByPlaceholder("Value").press("Enter");
  await expect(metadata.getByText("x86_64")).toBeVisible();
  await reload(page);
  await page.getByRole("button", { name: /build\.tar/ }).click();
  await expect(metadata.getByText("x86_64")).toBeVisible();

  await metadata.getByTitle("Edit").click();
  await metadata.getByPlaceholder("Value").fill("aarch64");
  await metadata.getByRole("button", { name: "Save" }).click();
  await expect(metadata.getByText("aarch64")).toBeVisible();

  await metadata.getByTitle("Remove").click();
  await page.getByRole("button", { name: "icon-trash Remove" }).click();
  await expect(metadata.getByText("No metadata")).toBeVisible();
});

test("an artifact can be redacted", async ({ page, peer }) => {
  const rid = await fillRelease(page, peer);
  await page.getByRole("button", { name: "Create release" }).click();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));
  await page.getByRole("button", { name: /build\.tar/ }).click();

  await page.getByRole("button", { name: "Redact" }).click();
  const modal = page.locator("[data-modal-content]");
  await modal
    .getByPlaceholder("Why should this no longer be used?")
    .fill("bad");
  await modal.getByRole("button", { name: "Redact" }).click();
  await expect(modal).toBeHidden();

  // A redaction by the author hides the artifact by default.
  await expect(page.getByText("No artifacts")).toBeVisible();
  await page.getByRole("button", { name: /Show redacted/ }).click();
  await page.getByRole("button", { name: /build\.tar/ }).click();
  await expect(page.getByText("bad", { exact: true })).toBeVisible();
});

// Calls a command on the peer's test backend directly, bypassing the app.
function backend(peer: RadiclePeer) {
  return async (cmd: string, args: object) => {
    const { hostname, port } = peer.httpdBaseUrl;
    const response = await fetch(`http://${hostname}:${port}/${cmd}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    expect(response.ok).toBe(true);
    return response.json();
  };
}

test("opening another release starts from a fresh page", async ({
  page,
  peer,
}) => {
  const { rid, repoFolder } = await createProject(peer);
  const file = Path.join(repoFolder, "build.tar");
  await Fs.writeFile(file, "artifact bytes");
  const call = backend(peer);
  const releaseIds: string[] = [];
  // Both releases carry the same bytes, so their artifacts share a CID.
  for (const revision of ["main~1", "main"]) {
    const { stdout: oid } = await peer.git(["rev-parse", revision], {
      cwd: repoFolder,
    });
    const releaseId: string = await call("create_or_open_release", {
      rid,
      oid: oid.trim(),
      tag: null,
    });
    const { cid, sizeBytes } = await call("compute_artifact_cid", {
      path: file,
    });
    await call("register_artifact", {
      rid,
      releaseId,
      cid,
      name: "build.tar",
      sizeBytes,
    });
    releaseIds.push(releaseId);
  }
  const [first, second] = releaseIds;

  await page.goto(`/repos/${rid}/releases/${first}`);
  await page.getByRole("button", { name: /build\.tar/ }).click();
  const attestations = page
    .locator(".section")
    .filter({ hasText: /^Attestations/ });
  await expect(attestations).toBeVisible();

  // A link to another release, as a mention renders one, navigates in place.
  await page.evaluate(href => {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = "Next release";
    document.body.append(link);
  }, `/repos/${rid}/releases/${second}`);
  await page.getByRole("link", { name: "Next release" }).click();

  await expect(page.locator(".title").getByText("Add notes")).toBeVisible();
  await expect(attestations).toBeHidden();
});

test("a failed refresh after registering is not reported as a failure", async ({
  page,
  peer,
}) => {
  const rid = await fillRelease(page, peer);
  await page.getByRole("button", { name: "Create release" }).click();
  await expect(page).toHaveURL(new RegExp(`/repos/${rid}/releases/\\w+`));

  const other = Path.join(peer.checkoutPath, "other.tar");
  await Fs.writeFile(other, "other bytes");
  await page.route(/\/pick_artifact_files$/, route =>
    route.fulfill({ json: [other] }),
  );
  await page.route(/\/release_by_id$/, route =>
    route.fulfill({
      status: 500,
      json: { code: "UnknownError", message: "refresh failed" },
    }),
  );
  const modal = page.locator("[data-modal-content]");
  await page.getByRole("button", { name: "Register artifacts" }).click();
  await page.getByRole("button", { name: "Files…" }).click();
  await modal.getByRole("button", { name: "icon-plus Register" }).click();

  await expect(modal).toBeHidden();
  await expect(page.getByText("Registering failed.")).toBeHidden();
});

// Bob publishes an artifact; the app runs as eve, who isn't a delegate.
async function openBobsArtifact(page: Page, peerManager: PeerManager) {
  const { bob, eve } = await createCollaborators(peerManager);
  const { rid, repoFolder } = await createProject(bob);
  const { stdout: head } = await bob.git(["rev-parse", "main"], {
    cwd: repoFolder,
  });
  const file = Path.join(bob.checkoutPath, "build.tar");
  await Fs.writeFile(file, "artifact bytes");

  await bob.startHttpd();
  const call = backend(bob);
  const releaseId: string = await call("create_or_open_release", {
    rid,
    oid: head.trim(),
    tag: null,
  });
  const { cid, sizeBytes } = await call("compute_artifact_cid", { path: file });
  await call("register_artifact", {
    rid,
    releaseId,
    cid,
    name: "build.tar",
    sizeBytes,
  });

  await clone(eve, rid);
  await eve.startHttpd();
  await useBackend(page, eve);
  await page.goto(`/repos/${rid}/releases/${releaseId}`);
  await page.getByRole("button", { name: /build\.tar/ }).click();
  return eve;
}

test("a non-delegate can attest an artifact by reproducing it", async ({
  page,
  peerManager,
}) => {
  const eve = await openBobsArtifact(page, peerManager);
  const other = Path.join(eve.checkoutPath, "other.tar");
  const same = Path.join(eve.checkoutPath, "same.tar");
  await Fs.writeFile(other, "other bytes");
  await Fs.writeFile(same, "artifact bytes");
  const attestations = page
    .locator(".section")
    .filter({ hasText: /^Attestations/ });

  await page.route(/\/pick_artifact_files$/, route =>
    route.fulfill({ json: [other] }),
  );
  await attestations.getByRole("button", { name: /Attest/ }).click();
  await expect(
    page.getByText("Your build has a different CID, so it was not attested."),
  ).toBeVisible();

  await page.route(/\/pick_artifact_files$/, route =>
    route.fulfill({ json: [same] }),
  );
  await attestations.getByRole("button", { name: /Attest/ }).click();
  await expect(attestations.getByText("eve")).toBeVisible();
  await expect(
    attestations.getByRole("button", { name: /Attest/ }),
  ).toBeHidden();
});

test("a non-delegate cannot redact, edit or delete someone else's release", async ({
  page,
  peerManager,
}) => {
  await openBobsArtifact(page, peerManager);

  await expect(
    page.locator(".section").filter({ hasText: /^Attestations/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Redact" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Delete" })).toBeHidden();
  const metadata = page.locator(".section").filter({ hasText: /^Metadata/ });
  await expect(metadata.getByRole("button", { name: "Add" })).toBeHidden();
});
