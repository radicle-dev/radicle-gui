import type { BaseUrl } from "@http-client";

import isEqual from "lodash/isEqual";
import storedWritable from "@app/lib/localStore";
import * as z from "zod";
import { derived, get, writable } from "svelte/store";

import config from "@app/lib/config";

const seedSchema = z.object({
  hostname: z.string(),
  port: z.number(),
  scheme: z.string(),
});

// The seed the user explicitly picked, or `undefined` when they never did.
// Read `searchSeed` instead of this unless you need to distinguish an explicit
// pick from a resolved fallback.
export const explicitSeed = storedWritable<BaseUrl | undefined>(
  "selectedSeed",
  seedSchema,
  undefined,
  !window.localStorage,
);

// Per-browser random number used to deterministically bucket the user into one
// of the preferred seeds (see `determineSeed`). Stored once on first visit and
// reused thereafter, but the *seed it resolves to* is recomputed against the
// current preferred-seeds list — so adding or removing seeds in config
// rebalances existing users automatically.
export const seedBucketRandom = storedWritable<number | undefined>(
  "seedBucketRandom",
  z.number().int().nonnegative(),
  undefined,
  !window.localStorage,
);

// A list of seeds that the user has explicitly bookmarked.
export const bookmarkedSeeds = storedWritable<BaseUrl[]>(
  "bookmarkedSeeds",
  z.array(seedSchema),
  [],
  !window.localStorage,
);

function dropRetiredDefaultSeed() {
  const pinned = get(explicitSeed);
  if (
    pinned &&
    !config.preferredSeeds.some(s => isEqual(s, pinned)) &&
    !get(bookmarkedSeeds).some(s => isEqual(s, pinned))
  ) {
    explicitSeed.clear();
  }
}

dropRetiredDefaultSeed();

// Session-scoped set of seeds the app tried and failed to reach. Used to
// surface a warning icon in the seed picker.
export const failedSeeds = writable<BaseUrl[]>([]);

export function markSeedFailed(seed: BaseUrl) {
  failedSeeds.update(previous =>
    previous.some(s => isEqual(s, seed)) ? previous : [...previous, seed],
  );
}

export function clearSeedFailure(seed: BaseUrl) {
  failedSeeds.update(previous => previous.filter(s => !isEqual(s, seed)));
}

export function removeBookmark(seed: BaseUrl) {
  bookmarkedSeeds.update(previous => previous.filter(x => !isEqual(x, seed)));
  if (isEqual(get(explicitSeed), seed)) {
    // Clear the explicit pick so `determineSeed()` falls back through its
    // normal resolution path (bucket-pick a preferred seed). Setting it to the
    // first remaining bookmark would bypass the bucket-based load balancing.
    explicitSeed.set(undefined);
  }
}

export function addBookmark(seed: BaseUrl) {
  bookmarkedSeeds.update(previous => [...previous, seed]);
}

function getOrCreateBucketRandom(): number {
  let value = get(seedBucketRandom);
  if (value === undefined) {
    value = Math.floor(Math.random() * 2 ** 32);
    seedBucketRandom.set(value);
  }
  return value;
}

// Resolve the primary seed for "auto" / unspecified contexts.
//   1. Explicit pick → use it.
//   2. Otherwise pick a preferred seed by hashing the stored per-browser
//      bucket number against the current preferred-seeds list. This keeps a
//      user on the same seed across visits when the list is unchanged, but
//      probabilistically rebalances them onto new seeds when the list grows.
// The config must list at least one preferred seed.
export function determineSeed(): BaseUrl {
  const explicit = get(explicitSeed);
  if (explicit) return explicit;

  const pool = config.preferredSeeds;
  if (pool.length === 0) {
    throw new Error("Config must list at least one seed in `preferredSeeds`");
  }
  const bucket = getOrCreateBucketRandom();
  return pool[bucket % pool.length];
}

// The seed that searches and the explore listing run against. Derived so
// components react to a new pick, and to the bucket number that `determineSeed`
// creates on first use.
export const searchSeed = derived([explicitSeed, seedBucketRandom], () =>
  determineSeed(),
);

// Ordered list of seeds to try for failover: the primary first, then the rest
// of the preferred pool (deduplicated).
export function seedCandidates(): BaseUrl[] {
  const primary = determineSeed();
  const seen = new Set<string>();
  const key = (b: BaseUrl) => `${b.scheme}://${b.hostname}:${b.port}`;
  const out: BaseUrl[] = [];
  for (const s of [primary, ...config.preferredSeeds]) {
    const k = key(s);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}
