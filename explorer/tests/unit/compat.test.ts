import type { Release } from "@http-client";

import { describe, expect, test } from "vitest";
import {
  isOutdated,
  legacyHasOtherReleases,
  legacyReleasesQuery,
  legacyScopeReleases,
  releaseNumber,
  releasesSupported,
} from "@http-client/lib/compat";
import { repoSchema } from "@http-client/lib/repo";

const delegate = { id: "did:key:z6MkDelegate" };
const other = { id: "did:key:z6MkOther" };

const issues = { open: 1, closed: 2 };
const patches = { open: 3, draft: 0, archived: 0, merged: 4 };
const buckets = {
  delegate: 2,
  delegateRedacted: 1,
  other: 3,
  otherRedacted: 0,
};

const project = {
  data: { name: "heartwood", description: "", defaultBranch: "master" },
};

function repo(fields: Record<string, unknown>) {
  return repoSchema.parse({
    rid: "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
    payloads: {},
    delegates: [delegate],
    threshold: 1,
    visibility: { type: "public" },
    seeding: 1,
    ...fields,
  });
}

function release(creator: { id: string }): Release {
  return { creator } as Release;
}

describe("repo shape", () => {
  test("reads the top-level fields of current httpd", () => {
    const parsed = repo({
      payloads: {
        "xyz.radicle.project": {
          ...project,
          meta: { head: "abc", issues, patches, releases: 5 },
        },
      },
      cobs: { issues, patches, releases: buckets },
      defaultBranch: "refs/heads/main",
    });

    expect(parsed.cobs).toEqual({ issues, patches, releases: buckets });
    expect(parsed.defaultBranch).toBe("refs/heads/main");
    expect(parsed.releaseCount).toBe(buckets.delegate);
  });

  test("adapts the project payload of httpd 0.28.0 and 0.29.0", () => {
    const parsed = repo({
      payloads: {
        "xyz.radicle.project": {
          ...project,
          meta: { head: "abc", issues, patches, releases: 7 },
        },
      },
    });

    expect(parsed.cobs).toEqual({ issues, patches, releases: undefined });
    expect(parsed.defaultBranch).toBe("refs/heads/master");
    expect(parsed.releaseCount).toBe(7);
  });

  test("has no release count on httpd 0.27.0", () => {
    const parsed = repo({
      payloads: {
        "xyz.radicle.project": {
          ...project,
          meta: { head: "abc", issues, patches },
        },
      },
    });

    expect(parsed.cobs?.issues).toEqual(issues);
    expect(parsed.releaseCount).toBeUndefined();
  });

  test("has no release count on a build without releases", () => {
    const parsed = repo({ cobs: { issues, patches } });

    expect(parsed.releaseCount).toBeUndefined();
  });

  test("takes no default branch from a project payload without meta", () => {
    const parsed = repo({
      payloads: { "xyz.radicle.project": project },
      cobs: { patches },
    });

    expect(parsed.cobs).toEqual({ patches });
    expect(parsed.defaultBranch).toBeUndefined();
  });

  test("keeps a newer node's missing default branch missing", () => {
    const parsed = repo({
      payloads: {
        "xyz.radicle.project": {
          ...project,
          meta: { head: "abc", issues, patches, releases: 5 },
        },
      },
      cobs: { issues, patches, releases: buckets },
    });

    expect(parsed.defaultBranch).toBeUndefined();
    expect(parsed.releaseCount).toBe(buckets.delegate);
  });

  test.each([
    ["a direct HEAD", { HEAD: "refs/heads/main" }, "refs/heads/main"],
    [
      "a chained HEAD",
      { HEAD: "MAIN", MAIN: "refs/heads/trunk" },
      "refs/heads/trunk",
    ],
    ["a HEAD at a tag", { HEAD: "refs/tags/v1" }, undefined],
    ["a dangling HEAD", { HEAD: "MAIN" }, undefined],
    ["a cycle", { HEAD: "A", A: "B", B: "A" }, undefined],
  ])(
    "resolves the crefs default branch of older httpd from %s",
    (_, symbolic, expected) => {
      const parsed = repo({
        payloads: {
          "xyz.radicle.crefs": { data: { rules: {}, symbolic } },
        },
      });

      expect(parsed.defaultBranch).toBe(expected);
    },
  );

  test("prefers the crefs HEAD of older httpd to the project payload", () => {
    const parsed = repo({
      payloads: {
        "xyz.radicle.project": {
          ...project,
          meta: { head: "abc", issues, patches },
        },
        "xyz.radicle.crefs": {
          data: { symbolic: { HEAD: "refs/heads/main" } },
        },
      },
    });

    expect(parsed.defaultBranch).toBe("refs/heads/main");
  });

  test("falls back to the project payload without a crefs HEAD", () => {
    const parsed = repo({
      payloads: {
        "xyz.radicle.project": {
          ...project,
          meta: { head: "abc", issues, patches },
        },
        "xyz.radicle.crefs": { data: { rules: {} } },
      },
    });

    expect(parsed.defaultBranch).toBe("refs/heads/master");
  });

  test("takes the default branch tip from meta without canonical refs", () => {
    const parsed = repo({
      payloads: {
        "xyz.radicle.project": {
          ...project,
          meta: { head: "abc", issues, patches },
        },
      },
    });

    expect(parsed.refs).toEqual({
      tags: {},
      refs: { "refs/heads/master": "abc" },
    });
  });

  test("adds the default branch tip from meta to canonical refs", () => {
    const parsed = repo({
      payloads: {
        "xyz.radicle.project": {
          ...project,
          meta: { head: "abc", issues, patches },
        },
      },
      refs: { tags: {}, refs: { "refs/heads/dev": "def" } },
    });

    expect(parsed.refs?.refs).toEqual({
      "refs/heads/dev": "def",
      "refs/heads/master": "abc",
    });
  });

  test("prefers the canonical default branch tip to meta", () => {
    const parsed = repo({
      payloads: {
        "xyz.radicle.project": {
          ...project,
          meta: { head: "abc", issues, patches },
        },
      },
      refs: { tags: {}, refs: { "refs/heads/master": "def" } },
    });

    expect(parsed.refs?.refs["refs/heads/master"]).toBe("def");
  });

  test("takes no tip from meta for a crefs HEAD on another branch", () => {
    const parsed = repo({
      payloads: {
        "xyz.radicle.project": {
          ...project,
          meta: { head: "abc", issues, patches },
        },
        "xyz.radicle.crefs": {
          data: { symbolic: { HEAD: "refs/heads/main" } },
        },
      },
    });

    expect(parsed.refs).toBeUndefined();
  });

  test("takes no tip from meta on current httpd", () => {
    const parsed = repo({
      payloads: {
        "xyz.radicle.project": {
          ...project,
          meta: { head: "abc", issues, patches },
        },
      },
      cobs: { issues, patches },
      defaultBranch: "refs/heads/master",
      refs: { tags: {}, refs: {} },
    });

    expect(parsed.refs?.refs).toEqual({});
  });

  test("parses a repo with a malformed crefs payload", () => {
    const parsed = repo({
      payloads: { "xyz.radicle.crefs": { data: { symbolic: 1 } } },
    });

    expect(parsed.defaultBranch).toBeUndefined();
  });

  test("parses a repo without a project payload", () => {
    const parsed = repo({});

    expect(parsed.cobs).toBeUndefined();
    expect(parsed.defaultBranch).toBeUndefined();
    expect(parsed.releaseCount).toBeUndefined();
  });
});

describe("legacyReleasesQuery", () => {
  test("asks older nodes for every author in the untrusted scope", () => {
    expect(legacyReleasesQuery("untrusted")).toEqual({ allAuthors: true });
  });

  test.each(["trusted" as const, undefined])("adds nothing for %s", scope => {
    expect(legacyReleasesQuery(scope)).toEqual({});
  });
});

describe("legacyScopeReleases", () => {
  const releases = [release(delegate), release(other)];

  test("keeps every release in the trusted scope", () => {
    expect(legacyScopeReleases(releases, [delegate], "trusted")).toEqual(
      releases,
    );
  });

  test("drops delegate releases from the untrusted scope", () => {
    expect(legacyScopeReleases(releases, [delegate], "untrusted")).toEqual([
      release(other),
    ]);
  });
});

describe("legacyHasOtherReleases", () => {
  test("finds releases by others", async () => {
    const page = async () => [release(delegate), release(other)];
    expect(await legacyHasOtherReleases(page, [delegate], 10)).toBe(true);
  });

  test("finds none when only delegates released", async () => {
    const page = async () => [release(delegate)];
    expect(await legacyHasOtherReleases(page, [delegate], 10)).toBe(false);
  });

  test("assumes others after a full page", async () => {
    const page = async () => [release(delegate)];
    expect(await legacyHasOtherReleases(page, [delegate], 1)).toBe(true);
  });

  test("assumes others when the fetch fails", async () => {
    const page = () => Promise.reject(new Error("offline"));
    expect(await legacyHasOtherReleases(page, [delegate], 10)).toBe(true);
  });
});

describe("releaseNumber", () => {
  test("reads the release number of a release build", () => {
    expect(releaseNumber("0.31.0-abc123")).toBe("0.31.0");
    expect(releaseNumber("1.2.3")).toBe("1.2.3");
  });

  test("has none for builds without one", () => {
    expect(releaseNumber("pre-release-abc123")).toBeUndefined();
    expect(releaseNumber("nix-abc123-abc123")).toBeUndefined();
  });
});

describe("isOutdated", () => {
  test("compares 0.y as the major before 1.0", () => {
    expect(isOutdated("0.27.0", "0.28.0")).toBe(true);
    expect(isOutdated("0.28.0-unknown", "0.28.0")).toBe(false);
    expect(isOutdated("0.31.2", "0.28.0")).toBe(false);
    expect(isOutdated("1.2.0", "0.28.0")).toBe(false);
  });

  test("compares the major from 1.0 on", () => {
    expect(isOutdated("0.40.0", "1.0.0")).toBe(true);
    expect(isOutdated("1.9.0", "2.0.0")).toBe(true);
    expect(isOutdated("2.0.0", "2.0.0")).toBe(false);
    expect(isOutdated("2.5.1-abc123", "2.0.0")).toBe(false);
    expect(isOutdated("2.0.0", "2.3.0")).toBe(false);
    expect(isOutdated("1.9.0", "2.3.0")).toBe(true);
  });

  test("does not warn on builds without a release number", () => {
    expect(isOutdated("pre-release-abc123", "2.0.0")).toBe(false);
    expect(isOutdated("nix-abc123-abc123", "2.0.0")).toBe(false);
  });
});

describe("releasesSupported", () => {
  test("follows the node's flag, with or without a count", () => {
    expect(releasesSupported(true, { releaseCount: undefined })).toBe(true);
    expect(releasesSupported(false, { releaseCount: 2 })).toBe(false);
  });

  test("reads a count as support on older nodes", () => {
    expect(releasesSupported(undefined, { releaseCount: 0 })).toBe(true);
    expect(releasesSupported(undefined, { releaseCount: undefined })).toBe(
      false,
    );
  });
});
