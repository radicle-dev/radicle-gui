import type { RadiclePeer, SpawnOptions } from "@tests/support/peerManager.js";

export async function create(
  peer: RadiclePeer,
  title: string,
  description: string,
  labels: string[],
  options: SpawnOptions,
): Promise<string> {
  const issueOptions: string[] = [
    "issue",
    "open",
    "--title",
    title,
    "--description",
    description,
    ...(labels.length > 0 ? ["--labels", labels.join(",")] : []),
  ];
  const { stdout } = await peer.rad(issueOptions, options);
  const match = stdout.match(/Issue {3}([a-zA-Z0-9]*)/);
  if (!match) {
    throw new Error("Not able to parse issue id");
  }
  return match[1];
}
