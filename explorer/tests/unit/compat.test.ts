import type { Release } from "@http-client";

import { describe, expect, test } from "vitest";
import {
  legacyHasOtherReleases,
  legacyReleasesQuery,
  legacyScopeReleases,
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
  test("reads the top-level fields of httpd 0.30.0", () => {
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
    "resolves the crefs default branch of httpd < 0.30.0 from %s",
    (_, symbolic, expected) => {
      const parsed = repo({
        payloads: {
          "xyz.radicle.crefs": { data: { rules: {}, symbolic } },
        },
      });

      expect(parsed.defaultBranch).toBe(expected);
    },
  );

  test("prefers the crefs HEAD of httpd < 0.30.0 to the project payload", () => {
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
