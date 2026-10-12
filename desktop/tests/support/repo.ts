import type { Page } from "@playwright/test";
import type { RadiclePeer } from "@tests/support/peerManager";

import * as Path from "node:path";

export async function changeBranch(peer: string, branch: string, page: Page) {
  await page.getByTitle("Change branch").click();
  const peerLocator = page.getByLabel("peer-item").filter({ hasText: peer });
  await peerLocator.getByTitle("Expand peer").click();
  await page.getByRole("button", { name: branch }).click();
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

  return { rid, repoFolder, defaultBranch };
}

export function extractPatchId(cmdOutput: { stderr: string }) {
  const match = cmdOutput.stderr.match(/[0-9a-f]{40}/);
  if (match) {
    return match[0];
  } else {
    throw new Error("Could not get patch id");
  }
}
