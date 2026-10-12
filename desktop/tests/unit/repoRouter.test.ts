import type { RepoRoute } from "@app/views/repo/router";

import { repoRouteToPath, repoUrlToRoute } from "@app/views/repo/router";
import { describe, expect, test } from "vitest";

const rid = "rad:z3fpY7nttPPa6MBnAv2DccHzQJnqe";
const peer = "z6MkqGC3nWZhYieEVTVDKW5v588CiGfsDSmRVG9ZwwWTvLSK";
const sha = "a".repeat(40);

function parse(path: string): RepoRoute | null {
  const url = new URL(path, "http://localhost");
  const segments = url.pathname.substring(1).split("/");
  expect(segments.shift()).toBe("repos");
  return repoUrlToRoute(segments, url.searchParams);
}

describe("repoRouteToPath and repoUrlToRoute round trip", () => {
  test.each<[string, RepoRoute]>([
    ["/repos/RID/home", { resource: "repo.home", rid }],
    ["/repos/RID/home/remotes/PEER", { resource: "repo.home", rid, peer }],
    [
      "/repos/RID/home/feature/branch",
      { resource: "repo.home", rid, revision: "feature/branch" },
    ],
    [
      "/repos/RID/home/remotes/PEER/feature/branch",
      { resource: "repo.home", rid, peer, revision: "feature/branch" },
    ],
    [
      "/repos/RID/home/main?path=src%2Flib.rs",
      { resource: "repo.home", rid, revision: "main", path: "src/lib.rs" },
    ],
    ["/repos/RID/commits", { resource: "repo.commits", rid }],
    [
      "/repos/RID/commits/main",
      { resource: "repo.commits", rid, revision: "main" },
    ],
    [
      "/repos/RID/commits/remotes/PEER/SHA",
      { resource: "repo.commits", rid, peer, revision: sha },
    ],
    ["/repos/RID/commits/SHA", { resource: "repo.commit", rid, commit: sha }],
    ["/repos/RID/identity", { resource: "repo.identity", rid }],
    [
      "/repos/RID/issues?status=all",
      { resource: "repo.issues", rid, status: "all" },
    ],
    [
      "/repos/RID/issues?status=closed",
      { resource: "repo.issues", rid, status: "closed" },
    ],
    [
      "/repos/RID/issues/abc?status=open",
      { resource: "repo.issue", rid, issue: "abc", status: "open" },
    ],
    [
      "/repos/RID/patches",
      { resource: "repo.patches", rid, status: undefined },
    ],
    [
      "/repos/RID/patches?status=merged",
      { resource: "repo.patches", rid, status: "merged" },
    ],
    [
      "/repos/RID/patches/abc",
      {
        resource: "repo.patch",
        rid,
        patch: "abc",
        status: undefined,
        reviewId: undefined,
      },
    ],
    [
      "/repos/RID/patches/abc?status=draft&review=def&view=changes",
      {
        resource: "repo.patch",
        rid,
        patch: "abc",
        status: "draft",
        reviewId: "def",
        view: "changes",
      },
    ],
    [
      "/repos/RID/releases",
      { resource: "repo.releases", rid, scope: undefined },
    ],
    [
      "/repos/RID/releases?scope=untrusted",
      { resource: "repo.releases", rid, scope: "untrusted" },
    ],
    [
      "/repos/RID/releases?scope=trusted",
      { resource: "repo.releases", rid, scope: "trusted" },
    ],
    [
      "/repos/RID/releases/abc",
      {
        resource: "repo.release",
        rid,
        release: "abc",
        scope: undefined,
        artifactScope: undefined,
      },
    ],
    [
      "/repos/RID/releases/abc?scope=trusted",
      {
        resource: "repo.release",
        rid,
        release: "abc",
        scope: "trusted",
        artifactScope: undefined,
      },
    ],
    [
      "/repos/RID/releases/abc?scope=untrusted&artifacts=untrusted",
      {
        resource: "repo.release",
        rid,
        release: "abc",
        scope: "untrusted",
        artifactScope: "untrusted",
      },
    ],
  ])("%s", (template, route) => {
    const path = template
      .replace("RID", rid)
      .replace("PEER", peer)
      .replace("SHA", sha);

    expect(repoRouteToPath(route)).toBe(path);
    expect(parse(path)).toEqual(route);
  });
});

describe("repoUrlToRoute", () => {
  test("defaults issues listing status to all", () => {
    expect(parse(`/repos/${rid}/issues`)).toEqual({
      resource: "repo.issues",
      rid,
      status: "all",
    });
  });

  test("falls back to all for an unknown issues listing status", () => {
    expect(parse(`/repos/${rid}/issues?status=bogus`)).toEqual({
      resource: "repo.issues",
      rid,
      status: "all",
    });
  });

  test("defaults single issue status to all", () => {
    expect(parse(`/repos/${rid}/issues/abc`)).toEqual({
      resource: "repo.issue",
      rid,
      issue: "abc",
      status: "all",
    });
  });

  test("does not route issue creation", () => {
    expect(parse(`/repos/${rid}/issues/create`)).toBeNull();
  });

  test("ignores an unknown patch view", () => {
    expect(parse(`/repos/${rid}/patches/abc?view=bogus`)).toEqual({
      resource: "repo.patch",
      rid,
      patch: "abc",
    });
  });

  test("leaves the trusted artifact scope out of the URL", () => {
    expect(
      repoRouteToPath({
        resource: "repo.release",
        rid,
        release: "abc",
        scope: undefined,
        artifactScope: "trusted",
      }),
    ).toBe(`/repos/${rid}/releases/abc`);
  });

  test("ignores an unknown release scope", () => {
    expect(
      parse(`/repos/${rid}/releases/abc?scope=bogus&artifacts=bogus`),
    ).toEqual({
      resource: "repo.release",
      rid,
      release: "abc",
      scope: undefined,
      artifactScope: undefined,
    });
  });

  test("treats a sha as a revision when a peer is given", () => {
    expect(parse(`/repos/${rid}/commits/remotes/${peer}/${sha}`)).toEqual({
      resource: "repo.commits",
      rid,
      peer,
      revision: sha,
    });
  });

  test("treats a commits revision that is a sha as a single commit", () => {
    const route: RepoRoute = { resource: "repo.commits", rid, revision: sha };

    expect(parse(repoRouteToPath(route))).toEqual({
      resource: "repo.commit",
      rid,
      commit: sha,
    });
  });

  test.each([`/repos/${rid}`, `/repos/${rid}/bogus`, "/repos/"])(
    "returns null for %s",
    path => {
      expect(parse(path)).toBeNull();
    },
  );
});
