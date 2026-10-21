import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { describe, expect } from "vitest";

import { testFixture } from "@http-client/tests/support/fixtures.js";
import { createRepo } from "@tests/support/repo.js";
import { useLocalHttpd } from "@tests/support/support.js";

describe("release", () => {
  // The release read API only exists in the local httpd build, so skip these
  // against the stable pre-built binary the default suite runs. Releases are
  // seeded on an isolated peer to avoid perturbing the shared fixtures.
  testFixture.skipIf(!useLocalHttpd)(
    "#getAllReleases(rid) + #getReleaseById(rid, id)",
    async ({ httpd: { api, peer } }) => {
      const { rid, repoFolder } = await createRepo(peer, {
        name: "releases",
        defaultBranch: "main",
      });
      const { stdout: head } = await peer.git(["rev-parse", "HEAD"], {
        cwd: repoFolder,
      });

      // Register an artifact from a local file so the CID is computed for us.
      const artifactPath = Path.join(repoFolder, "artifact.bin");
      await Fs.writeFile(artifactPath, "hello release\n");

      const { stdout: receipt } = await peer.spawn(
        "rad-artifact",
        ["--no-announce", "--no-input", "create", head, "--json"],
        { cwd: repoFolder },
      );
      const { releaseId } = JSON.parse(receipt);

      await peer.spawn(
        "rad-artifact",
        [
          "--no-announce",
          "--no-input",
          "register",
          artifactPath,
          "--release",
          releaseId,
          "--name",
          "binary",
        ],
        { cwd: repoFolder },
      );

      // The sole delegate created the release, so it shows under the default
      // delegate-scoped view.
      const releases = await api.repo.getAllReleases(rid);
      expect(releases.length).toBe(1);
      expect(releases[0].id).toBe(releaseId);
      expect(releases[0].oid).toBe(head);
      expect(releases[0].artifacts[0].name).toBe("binary");

      const release = await api.repo.getReleaseById(rid, releaseId);
      expect(release.id).toBe(releaseId);
      expect(release.artifacts.length).toBe(1);
    },
  );
});
