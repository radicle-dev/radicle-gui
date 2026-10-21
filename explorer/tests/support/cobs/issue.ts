import type { RadiclePeer } from "@tests/support/peerManager.js";
import type { Options } from "execa";

export async function create(
  peer: RadiclePeer,
  title: string,
  description: string,
  labels: string[],
  options: Options,
): Promise<string> {
  const issueOptions: string[] = [
    "issue",
    "open",
    "--title",
    title,
    "--description",
    description,
    ...labels.map(label => ["--labels", label]).flat(),
  ];
  const { stdout } = await peer.rad(issueOptions, options);
  const match = stdout.match(/Issue {3}([a-zA-Z0-9]*)/);
  if (!match) {
    throw new Error("Not able to parse issue id");
  }
  return match[1];
}
