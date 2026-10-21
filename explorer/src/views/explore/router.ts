import type { BaseUrl, NodeStats } from "@http-client";
import type { ErrorRoute, NotFoundRoute } from "@app/lib/router/definitions";

import isEqual from "lodash/isEqual";
import { get } from "svelte/store";

import { HttpdClient, ResponseError } from "@http-client";
import {
  clearSeedFailure,
  failedSeeds,
  markSeedFailed,
  seedCandidates,
} from "@app/views/nodes/SeedSelector";

const SEED_ATTEMPT_TIMEOUT_MS = 10000;

async function tryWithFailover<T>(
  fn: (baseUrl: BaseUrl, signal: AbortSignal) => Promise<T>,
): Promise<{ baseUrl: BaseUrl; result: T } | undefined> {
  // Re-order so seeds that already failed this session are tried last.
  // They stay in the list so a stale failure can't permanently lock the
  // user out — but a healthy seed gets the first 10s of every attempt.
  const failed = get(failedSeeds);
  const isFailed = (s: BaseUrl) => failed.some(f => isEqual(f, s));
  const candidates = seedCandidates();
  const ordered = [
    ...candidates.filter(s => !isFailed(s)),
    ...candidates.filter(s => isFailed(s)),
  ];
  for (const seed of ordered) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEED_ATTEMPT_TIMEOUT_MS);
    try {
      const result = await fn(seed, controller.signal);
      clearTimeout(timer);
      clearSeedFailure(seed);
      return { baseUrl: seed, result };
    } catch (error) {
      clearTimeout(timer);
      markSeedFailed(seed);
      console.warn(`Seed ${seed.hostname} unreachable:`, error);
    }
  }
  return undefined;
}

export interface ExploreRoute {
  resource: "explore";
  params: undefined;
}

export interface ExploreLoadedRoute {
  resource: "explore";
  params: {
    baseUrl: BaseUrl;
    searchAvailable: boolean;
  };
}

export type ExploreReposSort = "rid" | "activity" | "seeding";

export interface ExploreReposRoute {
  resource: "explore.repos";
  params: {
    page: number;
    sort: ExploreReposSort;
  };
}

export interface ExploreReposLoadedRoute {
  resource: "explore.repos";
  params: {
    baseUrl: BaseUrl;
    stats: NodeStats;
    page: number;
    sort: ExploreReposSort;
    searchAvailable: boolean;
  };
}

export function explorePath(): string {
  return "/explore";
}

export function exploreReposPath(
  page: number = 0,
  sort: ExploreReposSort = "seeding",
): string {
  const params = new URLSearchParams();
  if (sort !== "seeding") {
    params.set("sort", sort);
  }
  if (page > 0) {
    params.set("page", String(page));
  }
  const qs = params.toString();
  return qs ? `/explore/repos?${qs}` : "/explore/repos";
}

export function exploreTitle(
  route: ExploreLoadedRoute | ExploreReposLoadedRoute,
): string[] {
  if (route.resource === "explore.repos") {
    const heading =
      route.params.sort === "activity"
        ? "Recently active"
        : route.params.sort === "seeding"
          ? "Most seeded"
          : "All repos";
    return [heading, "Explore", "Radicle"];
  }
  return ["Explore", "Radicle"];
}

export async function loadExploreRoute(): Promise<
  ExploreLoadedRoute | NotFoundRoute | ErrorRoute
> {
  const attempt = await tryWithFailover(async (seed, signal) => {
    const api = new HttpdClient(seed);
    // Prefer /info — it tells us whether the seed has a search backend
    // configured. Only fall back to /node on a 404/405 (older httpd that
    // doesn't ship /info yet). Any other failure — network error, abort,
    // 5xx — rethrows so the caller can mark the seed failed and try the
    // next one, instead of silently masking outages as "no search".
    try {
      const info = await api.getInfo({ abort: signal });
      return { searchAvailable: info.httpd.searchAvailable };
    } catch (error) {
      if (
        error instanceof ResponseError &&
        (error.status === 404 || error.status === 405)
      ) {
        await api.getNode({ abort: signal });
        return { searchAvailable: false };
      }
      throw error;
    }
  });

  if (!attempt) {
    return {
      resource: "error",
      params: {
        title: "Unable to reach any seed",
        description:
          "We tried every configured seed node and none of them responded. Please try again later.",
      },
    };
  }

  return {
    resource: "explore",
    params: {
      baseUrl: attempt.baseUrl,
      searchAvailable: attempt.result.searchAvailable,
    },
  };
}

export async function loadExploreReposRoute(
  params: ExploreReposRoute["params"],
): Promise<ExploreReposLoadedRoute | NotFoundRoute | ErrorRoute> {
  const attempt = await tryWithFailover(async (seed, signal) => {
    const api = new HttpdClient(seed);
    const stats = await api.getStats({ abort: signal });
    // Prefer /info to learn whether the seed has a search backend.
    // Only swallow 404/405 (older httpd without /info); any other
    // failure rethrows so the seed gets marked failed.
    try {
      const info = await api.getInfo({ abort: signal });
      return { stats, searchAvailable: info.httpd.searchAvailable };
    } catch (error) {
      if (
        error instanceof ResponseError &&
        (error.status === 404 || error.status === 405)
      ) {
        return { stats, searchAvailable: false };
      }
      throw error;
    }
  });

  if (!attempt) {
    return {
      resource: "error",
      params: {
        title: "Unable to reach any seed",
        description:
          "We tried every configured seed node and none of them responded. Please try again later.",
      },
    };
  }

  return {
    resource: "explore.repos",
    params: {
      baseUrl: attempt.baseUrl,
      stats: attempt.result.stats,
      page: params.page,
      sort: params.sort,
      searchAvailable: attempt.result.searchAvailable,
    },
  };
}
