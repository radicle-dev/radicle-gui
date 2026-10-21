import * as FsSync from "node:fs";
import * as Path from "node:path";
import { test } from "vitest";

import { HttpdClient } from "@http-client";
import { RadiclePeer, createPeerManager } from "@tests/support/peerManager.js";
import { gitOptions } from "@tests/support/fixtures.js";
import { tmpDir } from "@tests/support/support.js";

interface TestFixtures {
  httpd: { api: HttpdClient; peer: RadiclePeer };
}

export const testFixture = test.extend<TestFixtures>({
  // eslint-disable-next-line no-empty-pattern
  httpd: async ({}, use) => {
    const peerManager = await createPeerManager({
      dataDir: Path.resolve(Path.join(tmpDir, "peers")),
      outputLog: FsSync.createWriteStream(
        Path.join(tmpDir, "peerManager.log"),
      ).setMaxListeners(16),
    });
    const peer = await peerManager.createPeer({
      name: "palm",
      gitOptions: gitOptions["alice"],
    });
    await peer.startHttpd();
    const api = new HttpdClient(peer.httpdBaseUrl);
    await use({ api, peer });
    await peer.shutdown();
  },
});
