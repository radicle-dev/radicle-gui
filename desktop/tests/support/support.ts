import type { SpawnOptions } from "@tests/support/peerManager.js";

import * as Crypto from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import { execa } from "execa";

// Generate string of 12 random characters with 8 bits of entropy.
export function randomTag(): string {
  return Crypto.randomBytes(8).toString("hex");
}

export function createOptions(repoFolder: string, days: number): SpawnOptions {
  return {
    cwd: repoFolder,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    env: { RAD_LOCAL_TIME: (1671211684 + days * 86400).toString() },
  };
}

const filename = fileURLToPath(import.meta.url);
export const supportDir = Path.dirname(filename);
export const tmpDir = Path.resolve(supportDir, "..", "./tmp");
export const fixturesDir = Path.resolve(supportDir, "..", "./fixtures");
export const testHttpApiBinary = Path.resolve(
  supportDir,
  "../..",
  process.env.CARGO_TARGET_DIR ?? "target",
  "debug",
  "test-http-api",
);

export const radJobBinary = Path.resolve(
  supportDir,
  "../..",
  process.env.CARGO_TARGET_DIR ?? "target",
  "debug",
  "rad-job",
);
const workspacePaths = [Path.join(tmpDir, "peers"), Path.join(tmpDir, "repos")];

export const heartwoodRelease = (
  await Fs.readFile(`${supportDir}/heartwood-release`, "utf8")
).trim();

// Assert that binaries are installed and are the correct version.
export async function assertBinariesInstalled(
  binary: string,
  expectedVersion: string,
  expectedPath: string,
): Promise<void> {
  const { stdout: which } = await execa("which", [binary]);
  if (Path.dirname(which) !== expectedPath) {
    throw new Error(
      `${binary} path doesn't match used ${binary} binary: ${expectedPath} !== ${which}`,
    );
  }
  const { stdout: version } = await execa(binary, ["--version"]);
  if (!version.includes(expectedVersion)) {
    throw new Error(
      `${binary} version ${version} does not satisfy ${expectedVersion}`,
    );
  }
}

export async function removeWorkspace(): Promise<void> {
  for (const path of workspacePaths) {
    await Fs.rm(path, {
      recursive: true,
      force: true,
    });
  }
}
