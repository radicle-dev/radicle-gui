import type { Page } from "@playwright/test";
import type { PeerManager, RadiclePeer } from "@tests/support/peerManager";
import type { Repo } from "@http-client";

import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import waitOn from "wait-on";
import { e2eSource } from "@tests/support/support.js";

import { defaultConfig, gitOptions } from "@tests/support/fixtures.js";

export async function changeBranch(peer: string, branch: string, page: Page) {
  await page.locator('[title="Change branch"]:visible').first().click();
  const peerLocator = page.getByLabel("peer-item").filter({ hasText: peer });

  const branchButton = page.getByRole("button", { name: branch });
  const isVisible = await branchButton.isVisible().catch(() => false);

  if (!isVisible) {
    await peerLocator.getByTitle("Expand peer").click();
  }

  await branchButton.click();
}

// Create a repo using the rad CLI.
export async function createRepo(
  peer: RadiclePeer,
  {
    name,
    description = "",
    defaultBranch = "main",
    visibility = "public",
  }: {
    name: string;
    description?: string;
    defaultBranch?: string;
    visibility?: "public" | "private";
  },
): Promise<{ rid: string; repoFolder: string; defaultBranch: string }> {
  const repoFolder = Path.join(peer.checkoutPath, name);

  await peer.git(["init", name, "--initial-branch", defaultBranch], {
    cwd: peer.checkoutPath,
  });
  await peer.git(["commit", "--allow-empty", "--message", "initial commit"], {
    cwd: repoFolder,
  });
  await peer.rad(
    [
      "init",
      "--name",
      name,
      "--default-branch",
      defaultBranch,
      "--description",
      description,
      `--${visibility}`,
    ],
    {
      cwd: repoFolder,
    },
  );

  const { stdout: rid } = await peer.rad(["inspect"], {
    cwd: repoFolder,
  });

  if (e2eSource === "meilisearch") {
    const { hostname, port } = peer.httpdBaseUrl;
    await waitOn({
      resources: [`http-get://${hostname}:${port}/api/v1/repos/${rid}`],
      timeout: 10_000,
    });
  }

  return { rid, repoFolder, defaultBranch };
}

// Run a rad-artifact command without prompts or network announcements.
export function radArtifact(
  peer: RadiclePeer,
  repoFolder: string,
  args: string[],
) {
  return peer.spawn("rad-artifact", ["--no-announce", "--no-input", ...args], {
    cwd: repoFolder,
  });
}

// Add a peer that has cloned the repo but is not a delegate, so tests can
// create releases and artifacts from a non-delegate author. Its contributions
// live in its own storage; pull them into the delegate's storage, which the UI
// reads, with `syncFrom`. The contributor is always Eve, which is safe because
// `peerManager` is scoped to a single test.
export async function createContributor(
  peerManager: PeerManager,
  delegate: RadiclePeer,
  { rid, repoName }: { rid: string; repoName: string },
): Promise<{ contributor: RadiclePeer; repoFolder: string }> {
  const contributor = await peerManager.createPeer({
    name: "eve",
    gitOptions: gitOptions["eve"],
  });
  await contributor.startNode({
    node: { ...defaultConfig.node, connect: [delegate.address], alias: "eve" },
  });
  await contributor.rad(["clone", rid], { cwd: contributor.checkoutPath });

  return {
    contributor,
    repoFolder: Path.join(contributor.checkoutPath, repoName),
  };
}

// Fetch what other peers have contributed to the repo. Artifact fixtures are
// registered without announcing, so the delegate's node needs an explicit
// fetch before its httpd serves them.
export async function syncFrom(peer: RadiclePeer, repoFolder: string) {
  await peer.rad(["sync", "--fetch"], { cwd: repoFolder });
}

// Write a file and register it as a release artifact. The file is named after
// the artifact and the CID is computed from its contents, which default to the
// name, so artifacts in one release need distinct names to get distinct CIDs.
// The release is created when `release` is not given.
export async function registerArtifact(
  peer: RadiclePeer,
  repoFolder: string,
  {
    name,
    content = `${name}\n`,
    revision = "HEAD",
    release,
  }: {
    name: string;
    content?: string;
    revision?: string;
    release?: string;
  },
): Promise<{ releaseId: string; cid: string }> {
  const artifactPath = Path.join(repoFolder, name);
  await Fs.writeFile(artifactPath, content);

  const { stdout } = await radArtifact(peer, repoFolder, [
    "register",
    artifactPath,
    ...(release ? ["--release", release] : ["--revision", revision]),
    "--name",
    name,
    "--json",
  ]);

  return JSON.parse(stdout);
}

type RepoMeta = Repo["payloads"]["xyz.radicle.project"]["meta"];

export async function waitForRepoMeta(
  peer: RadiclePeer,
  rid: string,
  predicate: (meta: RepoMeta) => boolean,
  timeoutMs = 10_000,
): Promise<void> {
  if (e2eSource !== "meilisearch") {
    return;
  }
  const { hostname, port } = peer.httpdBaseUrl;
  const url = `http://${hostname}:${port}/api/v1/repos/${rid}`;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const response = await fetch(url).catch(() => undefined);
    if (response?.ok) {
      const repo = await response.json();
      const meta = repo.payloads?.["xyz.radicle.project"]?.meta as
        RepoMeta | undefined;
      if (meta && predicate(meta)) {
        return;
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${rid} meta at ${url}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

export function extractPatchId(cmdOutput: { stderr: string }) {
  const match = cmdOutput.stderr.match(/[0-9a-f]{40}/);
  if (match) {
    return match[0];
  } else {
    throw new Error("Could not get patch id");
  }
}
