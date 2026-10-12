import type { PeerManager, RadiclePeer } from "@tests/support/peerManager.js";

import * as Fs from "node:fs/promises";
import * as Path from "node:path";

import * as issue from "@tests/support/cobs/issue.js";
import * as patch from "@tests/support/cobs/patch.js";
import { defaultConfig, gitOptions } from "@tests/support/fixtures.js";
import { createRepo } from "@tests/support/repo.js";

// Bob maintains the repo; eve is connected to him and can clone it, but isn't
// a delegate.
export async function createCollaborators(peerManager: PeerManager) {
  const bob = await peerManager.createPeer({
    name: "bob",
    gitOptions: gitOptions["bob"],
  });
  await bob.startNode();
  const eve = await peerManager.createPeer({
    name: "eve",
    gitOptions: gitOptions["eve"],
  });
  await eve.startNode({
    node: { ...defaultConfig.node, connect: [bob.address], alias: "eve" },
  });
  return { bob, eve };
}

// A repo with one file, one issue and one patch, all by `peer`.
export async function createProject(peer: RadiclePeer, name = "project") {
  const { rid, repoFolder } = await createRepo(peer, { name });
  const file = Path.join(repoFolder, "notes.txt");
  await Fs.writeFile(file, "one\ntwo\nthree\nfour\nfive\n");
  await peer.git(["add", "."], { cwd: repoFolder });
  await peer.git(["commit", "-m", "Add notes"], { cwd: repoFolder });
  await peer.git(["push", "rad", "main"], { cwd: repoFolder });
  const issueId = await issue.create(
    peer,
    "The notes are too quiet",
    "Nobody reads them.",
    [],
    { cwd: repoFolder },
  );
  const patchId = await patch.create(
    peer,
    ["Shout the third line"],
    "feature/shout",
    () => Fs.writeFile(file, "one\ntwo\nTHREE\nfour\nfive\n"),
    ["Shout the third line", "Readers skim, so the key line should stand out."],
    { cwd: repoFolder },
  );
  return { rid, repoFolder, issueId, patchId };
}

export async function clone(peer: RadiclePeer, rid: string) {
  await peer.rad(["clone", rid], { cwd: peer.checkoutPath });
}

// Resolves once `peer` has fetched `remote`'s changes to the COB `cobId`.
export async function waitForCobFrom(
  peer: RadiclePeer,
  remote: RadiclePeer,
  rid: string,
  cobId: string,
) {
  await peer.waitForEvent(
    event =>
      event.type === "refsFetched" &&
      event.rid === rid &&
      event.remote === remote.nodeId &&
      event.updated.some(update =>
        Object.values(update).some(ref => ref.name.endsWith(`/${cobId}`)),
      ),
    15_000,
  );
}
