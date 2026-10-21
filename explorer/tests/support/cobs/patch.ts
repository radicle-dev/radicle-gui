import type { RadiclePeer } from "@tests/support/peerManager.js";
import type { Options } from "execa";

export async function create(
  peer: RadiclePeer,
  commitLines: string[],
  branch: string,
  changeFn: () => Promise<void>,
  messages: string[],
  options: Options,
): Promise<string> {
  if (branch) {
    await peer.git(["reset", "--hard"], options);
    await peer.git(["switch", "main"], options);
    await peer.git(["switch", "-c", branch], options);
  }
  await changeFn();
  await peer.git(["add", "."], options);
  await peer.git(
    ["commit"].concat(...commitLines.map(line => ["-m", line])),
    options,
  );
  const cmd = [
    "push",
    ...messages.map(msg => ["-o", `patch.message=${msg}`]).flat(),
    "rad",
    "HEAD:refs/patches",
  ];
  const { stderr } = await peer.git(cmd, options);
  const match = stderr.match(/✓ Patch ([a-zA-Z0-9]*) opened/);
  if (!match) {
    throw new Error("Not able to parse patch id");
  }
  return match[1];
}

export async function merge(
  peer: RadiclePeer,
  targetBranch: string,
  featureBranch: string,
  options: Options,
): Promise<void> {
  await peer.git(["switch", targetBranch], options);
  await peer.git(["merge", featureBranch], options);
  await peer.git(["push", "rad", targetBranch], options);
}
