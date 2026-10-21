import * as Fs from "node:fs";
import * as Path from "node:path";
import {
  assertBinariesInstalled,
  heartwoodRelease,
  radicleArtifactRelease,
  radicleHttpdRelease,
  removeWorkspace,
  tmpDir,
  useLocalHttpd,
} from "@tests/support/support.js";
import {
  defaultConfig,
  createCobsFixture,
  createCommitsFixture,
  createMarkdownFixture,
  createSourceBrowsingFixture,
  gitOptions,
} from "@tests/support/fixtures.js";
import config from "@tests/support/config.js";
import { createPeerManager } from "@tests/support/peerManager.js";

const heartwoodBinaryPath = Path.join(
  tmpDir,
  "bin",
  "heartwood",
  heartwoodRelease,
).trim();
const artifactBinaryPath = Path.join(
  tmpDir,
  "bin",
  "artifact",
  radicleArtifactRelease,
).trim();
const httpdBinaryPath = useLocalHttpd
  ? Path.join(tmpDir, "bin", "httpd", "local").trim()
  : Path.join(tmpDir, "bin", "httpd", radicleHttpdRelease).trim();

process.env.PATH = [
  heartwoodBinaryPath,
  httpdBinaryPath,
  artifactBinaryPath,
  process.env.PATH,
].join(Path.delimiter);

export default async function globalSetup(): Promise<() => void> {
  try {
    await assertBinariesInstalled("rad", heartwoodRelease, heartwoodBinaryPath);
    await assertBinariesInstalled(
      "radicle-httpd",
      useLocalHttpd ? "pre-release" : radicleHttpdRelease,
      httpdBinaryPath,
    );
    await assertBinariesInstalled(
      "rad-artifact",
      radicleArtifactRelease,
      artifactBinaryPath,
    );
  } catch (error) {
    console.error(error);
    console.log("");
    console.log("To download the required test binaries, run:");
    console.log(" 👉 ./scripts/install-binaries");
    if (useLocalHttpd) {
      console.log("");
      console.log("To compile local radicle-httpd binary, run:");
      console.log(" 👉 ./scripts/compile-local-httpd");
    }
    console.log("");
    process.exit(1);
  }

  // Evaluated once at startup; captured by async setup operations.
  // Set SKIP_SETUP=true to skip both build and fixture creation on subsequent runs.
  // See CONTRIBUTING.md for details.
  const shouldSetup = !process.env.SKIP_SETUP;

  if (shouldSetup) {
    console.log("⚡ Starting parallel setup...");
  } else {
    console.log("⏭️ Skipping setup (SKIP_SETUP is set)");
  }

  // Run build and fixture setup in parallel
  const buildPromise = (async () => {
    if (shouldSetup) {
      console.log("  🔨  Starting build...");
      const { execa: exec } = await import("execa");
      try {
        await exec("npm", ["run", "build"]);
        console.log("  🔨  Build complete");
      } catch (error) {
        console.log("  🔨  Build failed!");
        if (error && typeof error === "object" && "stdout" in error) {
          console.log(error.stdout);
        }
        if (error && typeof error === "object" && "stderr" in error) {
          console.log(error.stderr);
        }
        throw error;
      }
    }
  })();

  const fixturesPromise = (async () => {
    if (shouldSetup) {
      console.log("  🗂️  Starting fixture creation...");
      await removeWorkspace();
    }

    const peerManager = await createPeerManager({
      dataDir: Path.resolve(tmpDir, "peers"),
      outputLog: Fs.createWriteStream(
        Path.resolve(tmpDir, "globalPeerManager.log"),
      )
        // Workaround for fixing MaxListenersExceededWarning.
        // Since every prefixOutput stream adds stream listeners that don't autoClose.
        // TODO: We still seem to have some descriptors left open when running vitest, which we should handle.
        .setMaxListeners(16),
    });

    const palm = await peerManager.createPeer({
      name: "palm",
      gitOptions: gitOptions["alice"],
    });

    if (shouldSetup) {
      await palm.startNode({
        web: {
          pinned: {
            repositories: ["rad:z4BwwjPCFNVP27FwVbDFgwVwkjcir"],
          },
          description: `:seedling: Radicle is an open source, peer-to-peer code collaboration stack built on Git.

:construction: [radicle.dev](https://radicle.dev)`,
        },
        node: {
          ...defaultConfig.node,
          seedingPolicy: { default: "allow", scope: "all" },
          alias: "palm",
        },
      });
      await palm.startHttpd(config.nodes.defaultHttpdPort);

      try {
        console.log("      Creating source-browsing fixture");
        await createSourceBrowsingFixture(peerManager, palm);
        console.log("      Creating markdown fixture");
        await createMarkdownFixture(palm);
        console.log("      Creating cobs fixture");
        await createCobsFixture(peerManager, palm);
        console.log("      Creating commits fixture");
        await createCommitsFixture(palm);
        console.log("  🗂️  All fixtures created");
      } catch (error) {
        console.log("");
        console.log("  🗂️  Not able to create the required fixtures.");
        console.log(
          "      Make sure you are not using binaries compiled for release.",
        );
        console.log("");
        console.log(error);
        console.log("");
        process.exit(1);
      }
      await palm.stopNode();
    } else {
      await palm.startHttpd(config.nodes.defaultHttpdPort);
    }

    return peerManager;
  })();

  // Wait for both build and fixtures to complete
  const [, peerManager] = await Promise.all([buildPromise, fixturesPromise]);

  if (shouldSetup) {
    console.log("🚀 Setup complete, ready to run tests");
  }

  // Print binary versions
  const { execa: exec } = await import("execa");
  const { stdout: radVersion } = await exec("rad", ["--version"]);
  const { stdout: gitRemoteRadVersion } = await exec("git-remote-rad", [
    "--version",
  ]);
  const { stdout: httpdVersion } = await exec("radicle-httpd", ["--version"]);
  const { stdout: radArtifactVersion } = await exec("rad-artifact", [
    "--version",
  ]);
  // radicle-httpd outputs logging lines, extract just the version line (last line)
  const httpdVersionClean =
    httpdVersion.trim().split("\n").pop() || httpdVersion;
  console.log("");
  console.log("Binary versions:");
  console.log(`  rad: ${radVersion.trim()}`);
  console.log(`  git-remote-rad: ${gitRemoteRadVersion.trim()}`);
  console.log(
    `  radicle-httpd: ${httpdVersionClean}${useLocalHttpd ? " (local)" : ""}`,
  );
  console.log(`  rad-artifact: ${radArtifactVersion.trim()}`);
  console.log("");

  return async () => {
    await peerManager.shutdown();
  };
}
