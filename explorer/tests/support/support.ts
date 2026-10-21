import type { Options } from "execa";

import { execa } from "execa";
import * as Crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as Path from "node:path";
import * as Fs from "node:fs/promises";

// Generate string of 12 random characters with 8 bits of entropy.
export function randomTag(): string {
  return Crypto.randomBytes(8).toString("hex");
}

export function createOptions(repoFolder: string, days: number): Options {
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
const workspacePaths = [Path.join(tmpDir, "peers"), Path.join(tmpDir, "repos")];

export const heartwoodRelease = (
  await Fs.readFile(`${supportDir}/heartwood-release`, "utf8")
).trim();

export const radicleHttpdRelease = (
  await Fs.readFile(`${supportDir}/radicle-httpd-release`, "utf8")
).trim();

export const radicleArtifactRelease = (
  await Fs.readFile(`${supportDir}/radicle-artifact-release`, "utf8")
).trim();

export const useLocalHttpd = process.env.USE_LOCAL_HTTPD === "true";

export const releaseApiOnlyLocal =
  "the release read API only exists in the local httpd build";

// Assert that binaries are installed and are the correct version.
export async function assertBinariesInstalled(
  binary: string,
  expectedVersion: string,
  expectedPath: string,
): Promise<void> {
  let which: string;
  try {
    ({ stdout: which } = await execa("which", [binary]));
  } catch {
    throw new Error(`${binary} is not installed`);
  }
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
