import type { Repo } from "./model";

// The public seed nodes the prototype knows about, and what each one hosts.
// Exploring or searching goes through one of them, like the explorer does
// through a seed's HTTP API.
export interface SeedNode {
  host: string;
  description: string;
  hosts: (repo: Repo, ownerHandle: string) => boolean;
}

export const SEED_NODES: SeedNode[] = [
  {
    host: "ash.seeds.rad",
    description: "Community seed. Hosts every public repository it hears about.",
    hosts: repo => repo.visibility === "public",
  },
  {
    host: "rowan.seeds.rad",
    description: "Community seed for projects run by orgs. Skips personal repositories.",
    hosts: (repo, owner) => repo.visibility === "public" && !owner.startsWith("@"),
  },
  {
    host: "seed.tidal.rad",
    description: "Run by Tidal for its own repositories.",
    hosts: (repo, owner) => repo.visibility === "public" && owner === "tidal",
  },
  {
    host: "seed.meshwork.net",
    description: "Runs on a rooftop in Cusco. Hosts Meshwork's repositories and a few friends'.",
    hosts: (repo, owner) =>
      repo.visibility === "public" && (owner === "meshwork" || owner === "@felix" || owner === "@noor"),
  },
];

// Browses what your own node stores instead of a seed.
export const LOCAL_NODE = "local";

export const DEFAULT_SEED = SEED_NODES[0].host;
