import { describe, expect, test } from "vitest";

import type { RadUri } from "@app/lib/radUri";
import {
  cobListType,
  explorerUrl,
  filePath,
  fileReference,
  formatRadUri,
  isFileReference,
  isSafeRef,
  issueType,
  parseExplorerTreeUrl,
  parseExplorerUrl,
  parseRadUri,
  parseReference,
  patchType,
  releaseType,
} from "@app/lib/radUri";

// The RIP 4 fixture `zk1arLZ…` decodes to 21 bytes, so like the
// `radicle-uri` crate these cases use `z21arLZ…`, one character apart.
const repo00 = "z3gqcJUbbbbbbbbbbbbbbbCSGazv5";
const repo01 = "z21arLZbbbbbbbbbbbbbbb26us45E";
const node01 = "z6MksFbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbS9wzpT";
const node02 = "z6Mku8bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbo9XVAx";
const seed = "seed.example.com:8776";
const oid = "e9cf5263ffffffffffffffffffffffffffffffff";

describe("RIP 4 examples", () => {
  const cases: [string, string, RadUri][] = [
    ["tc00a", `rad:${repo00}`, { repo: repo00 }],
    ["tc00b", `rad://${repo00}`, { repo: repo00 }],
    ["tc00c", `rad:///${repo00}`, { repo: repo00 }],
    ["tc01a", `rad:${repo01}/${node01}`, { repo: repo01, namespace: node01 }],
    ["tc01b", `rad://${repo01}/${node01}`, { repo: repo01, namespace: node01 }],
    [
      "tc01c",
      `rad:///${repo01}/${node01}`,
      { repo: repo01, namespace: node01 },
    ],
    [
      "tc02",
      `rad://${node01}/${repo01}`,
      { authority: { node: node01 }, repo: repo01 },
    ],
    [
      "tc03",
      `rad://${node01}/${repo01}/${node01}`,
      { authority: { node: node01 }, repo: repo01, namespace: node01 },
    ],
    [
      "tc04",
      `rad://${node01}@${seed}/${repo01}`,
      { authority: { node: node01, address: seed }, repo: repo01 },
    ],
    [
      "tc05",
      `rad://${node01}@${seed}/${repo01}/${node02}`,
      {
        authority: { node: node01, address: seed },
        repo: repo01,
        namespace: node02,
      },
    ],
    [
      "tc10a",
      `rad:${repo00}/commit/72db6dffffffffffffffffffffffffffffffffff`,
      {
        repo: repo00,
        resource: {
          type: "commit",
          ref: "72db6dffffffffffffffffffffffffffffffffff",
        },
      },
    ],
    [
      "tc10b",
      `rad:///${repo00}/commit/72db6dffffffffffffffffffffffffffffffffff`,
      {
        repo: repo00,
        resource: {
          type: "commit",
          ref: "72db6dffffffffffffffffffffffffffffffffff",
        },
      },
    ],
    [
      "tc12",
      `rad://${node01}/${repo01}/commit/${oid}`,
      {
        authority: { node: node01 },
        repo: repo01,
        resource: { type: "commit", ref: oid },
      },
    ],
    [
      "tc13",
      `rad://${node01}@${seed}/${repo01}/${node02}/commit/72db6dffffffffffffffffffffffffffffffffff`,
      {
        authority: { node: node01, address: seed },
        repo: repo01,
        namespace: node02,
        resource: {
          type: "commit",
          ref: "72db6dffffffffffffffffffffffffffffffffff",
        },
      },
    ],
    [
      "tc30",
      `rad:${repo01}/cob/org.example/${oid}`,
      {
        repo: repo01,
        resource: { type: "cob", typeName: "org.example", oid },
      },
    ],
    [
      "tc31",
      `rad://${node01}/${repo01}/cob/org.example/${oid}`,
      {
        authority: { node: node01 },
        repo: repo01,
        resource: { type: "cob", typeName: "org.example", oid },
      },
    ],
    [
      "tc32",
      `rad:${repo01}/cob/org.example`,
      { repo: repo01, resource: { type: "cob", typeName: "org.example" } },
    ],
    [
      "tc40a",
      `rad:${repo01}/tree/3eb47e9fffffffffffffffffffffffffffffffff?path=src`,
      {
        repo: repo01,
        resource: {
          type: "tree",
          oid: "3eb47e9fffffffffffffffffffffffffffffffff",
        },
        query: [{ param: "path", value: "src" }],
      },
    ],
    [
      "tc41a",
      `rad:${repo01}/commit/master?blob=README.md`,
      {
        repo: repo01,
        resource: { type: "commit", ref: "master" },
        query: [{ param: "blob", value: "README.md" }],
      },
    ],
    [
      "tc42a",
      `rad:${repo01}/commit/baz?path=foo/doc`,
      {
        repo: repo01,
        resource: { type: "commit", ref: "baz" },
        query: [{ param: "path", value: "foo/doc" }],
      },
    ],
    [
      "tc43a",
      `rad:${repo01}/commit/baz/foo?path=doc&path=src`,
      {
        repo: repo01,
        resource: { type: "commit", ref: "baz/foo" },
        query: [
          { param: "path", value: "doc" },
          { param: "path", value: "src" },
        ],
      },
    ],
    [
      "tc44",
      `rad:///${repo01}/commit/refs/notes/commit?blob=${oid}`,
      {
        repo: repo01,
        resource: { type: "commit", ref: "refs/notes/commit" },
        query: [{ param: "blob", value: oid }],
      },
    ],
  ];

  test.each(cases)("%s parses", (_, input, expected) => {
    expect(parseRadUri(input)).toEqual(expected);
  });
});

describe("parseRadUri", () => {
  test("is case-insensitive in the scheme and resource type", () => {
    expect(parseRadUri(`RAD:${repo00}/COMMIT/master`)).toEqual({
      repo: repo00,
      resource: { type: "commit", ref: "master" },
    });
  });

  test.each([
    [
      `cob/${issueType}/${oid.toUpperCase()}`,
      { type: "cob", typeName: issueType, oid },
    ],
    [`tree/${oid.toUpperCase()}`, { type: "tree", oid }],
    [`commit/${oid.toUpperCase()}`, { type: "commit", ref: oid }],
  ])("lowercases the oid in %s", (resource, expected) => {
    expect(parseRadUri(`rad:${repo00}/${resource}`)?.resource).toEqual(
      expected,
    );
  });

  test("parses an IPv6 authority", () => {
    expect(parseRadUri(`rad://${node01}@[::1]:8776/${repo00}`)).toEqual({
      authority: { node: node01, address: "[::1]:8776" },
      repo: repo00,
    });
  });

  test("parses a namespace followed by a resource", () => {
    expect(parseRadUri(`rad:${repo00}/${node01}/commit/master`)).toEqual({
      repo: repo00,
      namespace: node01,
      resource: { type: "commit", ref: "master" },
    });
  });

  test("reads a question mark after the fragment as part of it", () => {
    expect(parseRadUri(`rad:${repo00}#a?b`)).toEqual({
      repo: repo00,
      fragment: "a?b",
    });
  });
});

describe("rejects", () => {
  test.each([
    ["no scheme", repo00],
    ["another scheme", `https:${repo00}`],
    ["no repo", "rad:"],
    ["empty authority without a repo", "rad:///"],
    ["an absolute path without authority", `rad:/${repo00}`],
    ["a non-base58 repo id", "rad:z3gqcJUbbbbbbbbbbbbbbbCSGazv0"],
    ["a repo id of the wrong length", "rad:zk1arLZbbbbbbbbbbbbbbb26us45E"],
    ["an abbreviated tree oid", `rad:${repo00}/tree/abc123`],
    ["a blob that is not an oid", `rad:${repo00}/blob/not-a-sha1`],
    ["an abbreviated cob oid", `rad:${repo00}/cob/${issueType}/e9cf5263`],
    ["an unknown resource type", `rad:${repo00}/issues/${oid}`],
    [
      "an invalid authority node",
      `rad://z6Mk11111111111111111111111111111111111111111111/${repo00}`,
    ],
    [
      "an invalid namespace",
      `rad:${repo00}/z6Mk11111111111111111111111111111111111111111111`,
    ],
    ["an address without a port", `rad://${node01}@seed.example.com/${repo00}`],
    ["trailing input", `rad:${repo00}/commit/master trailing`],
    ["a trailing slash", `rad:${repo00}/`],
    ["a resource on the legacy form", `rad://${repo00}/commit/master`],
    ["a query on the legacy form", `rad://${repo00}?x`],
    ["an invalid host", `rad://${node01}@seed example.com:8776/${repo00}`],
    ["an authority without a repo", `rad://${node01}`],
    ["invalid query characters", `rad:${repo00}?a b`],
    ["invalid fragment characters", `rad:${repo00}#a b`],
    ["a tree with extra segments", `rad:${repo00}/tree/${oid}/src`],
    ["a cob with extra segments", `rad:${repo00}/cob/${issueType}/${oid}/x`],
    ["a cob type without a dot", `rad:${repo00}/cob/issue/${oid}`],
  ])("%s", (_, input) => {
    expect(parseRadUri(input)).toBeUndefined();
  });
});

describe("formatRadUri", () => {
  test.each([
    `rad:${repo00}`,
    `rad:${repo00}/${node01}`,
    `rad://${node01}/${repo00}`,
    `rad://${node01}@${seed}/${repo00}/${node02}/commit/master?path=src#L10`,
    `rad:${repo00}/tag/v1.0`,
    `rad:${repo00}/blob/${oid}`,
    `rad:${repo00}/cob/${patchType}/${oid}`,
    `rad:${repo00}?raw&path=src`,
    `rad:${repo00}/commit/master#section-1`,
    `rad:${repo00}?`,
  ])("round-trips %s", input => {
    const uri = parseRadUri(input);
    expect(uri).toBeDefined();
    expect(formatRadUri(uri!)).toBe(input);
  });

  test("drops an empty authority", () => {
    expect(formatRadUri(parseRadUri(`rad:///${repo00}/commit/master`)!)).toBe(
      `rad:${repo00}/commit/master`,
    );
  });

  test("writes an empty authority when forced", () => {
    expect(formatRadUri({ repo: repo00 }, { forceAuthority: true })).toBe(
      `rad:///${repo00}`,
    );
  });
});

describe("parseReference", () => {
  test("parses a DID", () => {
    expect(parseReference(`did:key:${node01}`)).toEqual({
      type: "did",
      node: node01,
    });
  });

  test("rejects a DID of another method", () => {
    expect(parseReference(`did:web:${node01}`)).toBeUndefined();
  });

  test("rejects an invalid DID", () => {
    expect(
      parseReference(
        "did:key:z6Mk11111111111111111111111111111111111111111111",
      ),
    ).toBeUndefined();
  });
});

describe("explorer URLs", () => {
  const template = "https://app.radicle.xyz/";
  const host = "seed.radicle.xyz";
  const base = `https://app.radicle.xyz/nodes/${host}`;

  test.each([
    [`rad:${repo00}`, `${base}/rad:${repo00}`],
    [
      `rad:${repo00}/cob/${issueType}/${oid}`,
      `${base}/rad:${repo00}/issues/${oid}`,
    ],
    [
      `rad:${repo00}/cob/${patchType}/${oid}`,
      `${base}/rad:${repo00}/patches/${oid}`,
    ],
    [
      `rad:${repo00}/cob/${releaseType}/${oid}`,
      `${base}/rad:${repo00}/releases/${oid}`,
    ],
    [`rad:${repo00}/commit/${oid}`, `${base}/rad:${repo00}/commits/${oid}`],
    [`rad:${repo00}/${node01}`, `${base}/rad:${repo00}/remotes/${node01}`],
    [`did:key:${node01}`, `${base}/users/did:key:${node01}`],
  ])("maps %s both ways", (reference, url) => {
    const parsed = parseReference(reference)!;
    expect(explorerUrl(parsed, template, host)).toBe(url);
    expect(parseExplorerUrl(url)).toEqual(parsed);
  });

  test("maps a branch to its tree", () => {
    expect(
      explorerUrl(
        parseReference(`rad:${repo00}/commit/master`)!,
        template,
        host,
      ),
    ).toBe(`${base}/rad:${repo00}/tree/master`);
  });

  test.each([
    [`commit/master?path=src/lib`, `/tree/master/src/lib`],
    [`commit/${oid}?blob=README.md`, `/tree/${oid}/README.md`],
    [`tag/v1.0?tree=docs`, `/tree/v1.0/docs`],
    [`${node01}/commit/master`, `/remotes/${node01}/tree/master`],
    [`${node01}/commit/${oid}`, `/commits/${oid}`],
  ])("maps %s", (resource, path) => {
    expect(
      explorerUrl(parseReference(`rad:${repo00}/${resource}`)!, template, host),
    ).toBe(`${base}/rad:${repo00}${path}`);
  });

  test("has no page for an unknown cob type", () => {
    expect(
      explorerUrl(
        parseReference(`rad:${repo00}/cob/org.example/${oid}`)!,
        template,
        host,
      ),
    ).toBeUndefined();
  });

  test("decodes percent-encoded ids", () => {
    expect(parseExplorerUrl(`${base}/users/did%3Akey%3A${node01}`)).toEqual({
      type: "did",
      node: node01,
    });
  });

  test("rejects an abbreviated oid", () => {
    expect(
      parseExplorerUrl(`${base}/rad:${repo00}/issues/e9cf5263`),
    ).toBeUndefined();
  });
});

describe("explorer URL edge cases", () => {
  const base = "https://app.radicle.xyz";
  const node = `${base}/nodes/seed.radicle.xyz`;

  test.each([
    [`tree/${oid}`, undefined],
    [`blob/${oid}`, undefined],
    ["commit/master?path=", `${node}/rad:${repo00}/tree/master`],
    [`cob/${issueType}`, `${node}/rad:${repo00}/issues`],
    ["commit/refs/heads/main", `${node}/rad:${repo00}/tree/main`],
    ["tag/refs/tags/v1.0", `${node}/rad:${repo00}/tree/v1.0`],
    ["commit/refs/notes/commit", undefined],
  ])("maps %s", (resource, url) => {
    expect(
      explorerUrl(
        parseReference(`rad:${repo00}/${resource}`)!,
        base,
        "seed.radicle.xyz",
      ),
    ).toBe(url);
  });

  test.each([
    ["a non-web scheme", `ftp://app.radicle.xyz/nodes/h/rad:${repo00}`],
    ["an invalid repo id", `${node}/rad:z3gqcJUbbbbbbbbbbbbbbbCSGazv0`],
    ["extra segments", `${node}/rad:${repo00}/issues/${oid}/x`],
    ["an unknown section", `${node}/rad:${repo00}/wiki/${oid}`],
    ["users before the end", `${node}/users/did:key:${node01}/x`],
    ["a branch followed by a path", `${node}/rad:${repo00}/tree/feature/x`],
    ["a history page", `${node}/rad:${repo00}/history/main`],
    [
      "an invalid remote",
      `${node}/rad:${repo00}/remotes/z6Mk11111111111111111111111111111111111111111111`,
    ],
  ])("parseExplorerUrl rejects %s", (_, url) => {
    expect(parseExplorerUrl(url)).toBeUndefined();
  });

  test("parseExplorerUrl lowercases the oid", () => {
    expect(
      parseExplorerUrl(`${node}/rad:${repo00}/commits/${oid.toUpperCase()}`),
    ).toEqual({
      type: "uri",
      uri: { repo: repo00, resource: { type: "commit", ref: oid } },
    });
  });

  test.each([
    [
      "a patch revision",
      `${node}/rad:${repo00}/patches/${oid}/${oid}?tab=changes`,
      { repo: repo00, resource: { type: "cob", typeName: patchType, oid } },
    ],
    [
      "an issue under a remote",
      `${node}/rad:${repo00}/remotes/${node01}/issues/${oid}`,
      { repo: repo00, resource: { type: "cob", typeName: issueType, oid } },
    ],
    [
      "a remote's tree",
      `${node}/rad:${repo00}/remotes/${node01}/tree`,
      { repo: repo00, namespace: node01 },
    ],
    [
      "a tree at an oid",
      `${node}/rad:${repo00}/tree/${oid}`,
      {
        repo: repo00,
        resource: { type: "commit", ref: oid },
        query: [{ param: "path", value: "" }],
      },
    ],
    [
      "an encoded path at an oid",
      `${node}/rad:${repo00}/tree/${oid}/My%20File.md`,
      {
        repo: repo00,
        resource: { type: "commit", ref: oid },
        query: [{ param: "path", value: "My%20File.md" }],
      },
    ],
    [
      "an issue list",
      `${node}/rad:${repo00}/issues?status=open`,
      { repo: repo00, resource: { type: "cob", typeName: issueType } },
    ],
    [
      "a patch list",
      `${node}/rad:${repo00}/patches`,
      { repo: repo00, resource: { type: "cob", typeName: patchType } },
    ],
    [
      "a release list",
      `${node}/rad:${repo00}/releases`,
      { repo: repo00, resource: { type: "cob", typeName: releaseType } },
    ],
    [
      "a bare repo id",
      `${node}/${repo00}/issues/${oid}`,
      { repo: repo00, resource: { type: "cob", typeName: issueType, oid } },
    ],
    [
      "a path at a commit",
      `${node}/rad:${repo00}/tree/${oid}/src/lib`,
      {
        repo: repo00,
        resource: { type: "commit", ref: oid },
        query: [{ param: "path", value: "src/lib" }],
      },
    ],
  ])("parseExplorerUrl reads %s", (_, url, uri) => {
    expect(parseExplorerUrl(url)).toEqual({ type: "uri", uri });
  });

  test("maps a path at a commit both ways", () => {
    const url = `${node}/rad:${repo00}/tree/${oid}/src/lib`;
    expect(explorerUrl(parseExplorerUrl(url)!, base, "seed.radicle.xyz")).toBe(
      url,
    );
  });
});

describe("file links", () => {
  const base = "https://radicle.network";
  const node = `${base}/nodes/seed.example.com`;

  test.each([
    [
      `${node}/rad:${repo00}/tree/0004-general-uri-scheme/general-uri-scheme.adoc`,
      { repo: repo00, path: "0004-general-uri-scheme/general-uri-scheme.adoc" },
    ],
    [
      `${node}/rad:${repo00}/remotes/${node01}/tree/feature/x/src`,
      { repo: repo00, namespace: node01, path: "feature/x/src" },
    ],
    [
      `${node}/rad:${repo00}/tree/main/My%20File.md`,
      { repo: repo00, path: "main/My File.md" },
    ],
  ])("parseExplorerTreeUrl reads %s", (url, expected) => {
    expect(parseExplorerTreeUrl(url)).toEqual(expected);
  });

  test.each([
    [
      "a branch",
      `${node}/rad:${repo00}/tree/main`,
      { repo: repo00, path: "main" },
    ],
    [
      "a remote's branch",
      `${node}/rad:${repo00}/remotes/${node01}/tree/main`,
      { repo: repo00, namespace: node01, path: "main" },
    ],
  ])("parseExplorerTreeUrl reads %s on its own", (_, url, expected) => {
    expect(parseExplorerTreeUrl(url)).toEqual(expected);
  });

  test.each([
    ["a tree at an oid", `${node}/rad:${repo00}/tree/${oid}/src`],
    ["another page", `${node}/rad:${repo00}/history/main/src`],
  ])("parseExplorerTreeUrl leaves %s to parseExplorerUrl", (_, url) => {
    expect(parseExplorerTreeUrl(url)).toBeUndefined();
  });

  test("fileReference writes a path query that maps back to the file", () => {
    const reference = fileReference(
      { repo: repo00 },
      "main",
      "docs/My File.md",
    )!;
    expect(
      formatRadUri(reference.type === "uri" ? reference.uri : { repo: "" }),
    ).toBe(`rad:${repo00}/commit/main?path=docs/My%20File.md`);
    expect(explorerUrl(reference, base, "seed.example.com")).toBe(
      `${node}/rad:${repo00}/tree/main/docs/My%20File.md`,
    );
  });

  test("fileReference keeps the remote", () => {
    expect(
      explorerUrl(
        fileReference({ repo: repo00, namespace: node01 }, "main", "src")!,
        base,
        "seed.example.com",
      ),
    ).toBe(`${node}/rad:${repo00}/remotes/${node01}/tree/main/src`);
  });

  test.each([
    [`rad:${repo00}/commit/main?path=src`, true],
    [`rad:${repo00}/tag/v1.0?blob=README.md`, true],
    [`rad:${repo00}/commit/main`, false],
    [`rad:${repo00}/commit/main?path=`, true],
    [`rad:${repo00}?path=src`, false],
    [`did:key:${node01}`, false],
  ])("isFileReference(%s) is %s", (input, expected) => {
    expect(isFileReference(parseReference(input)!)).toBe(expected);
  });

  test("filePath decodes the path", () => {
    expect(
      filePath(
        parseReference(`rad:${repo00}/commit/main?path=docs/My%20File.md`)!,
      ),
    ).toEqual({ revision: "main", path: "docs/My File.md" });
    expect(
      filePath(parseReference(`rad:${repo00}/commit/main`)!),
    ).toBeUndefined();
  });

  test("fileReference rejects a revision a URI cannot hold", () => {
    expect(fileReference({ repo: repo00 }, "a b", "src")).toBeUndefined();
  });
});

describe("tree roots and lists", () => {
  const base = "https://radicle.network";
  const node = `${base}/nodes/seed`;

  test.each([
    `${node}/rad:${repo00}/tree/${oid}`,
    `${node}/rad:${repo00}/issues`,
    `${node}/rad:${repo00}/patches`,
    `${node}/rad:${repo00}/releases`,
  ])("maps %s both ways", url => {
    expect(explorerUrl(parseExplorerUrl(url)!, base, "seed")).toBe(url);
  });

  test("fileReference with an empty path names the root", () => {
    expect(
      explorerUrl(fileReference({ repo: repo00 }, "main", "")!, base, "seed"),
    ).toBe(`${node}/rad:${repo00}/tree/main`);
  });

  test.each([
    [`rad:${repo00}/cob/${issueType}`, issueType],
    [`rad:${repo00}/cob/${issueType}/${oid}`, undefined],
    [`rad:${repo00}`, undefined],
  ])("cobListType(%s) is %s", (input, expected) => {
    expect(cobListType(parseReference(input)!)).toBe(expected);
  });
});

describe("line fragments", () => {
  const base = "https://radicle.network";
  const node = `${base}/nodes/seed`;

  test("a line of a file maps both ways", () => {
    const url = `${node}/rad:${repo00}/tree/${oid}/src/lib.rs#L10`;
    const reference = parseExplorerUrl(url)!;
    expect(reference).toMatchObject({ uri: { fragment: "L10" } });
    expect(explorerUrl(reference, base, "seed")).toBe(url);
  });

  test("parseExplorerTreeUrl keeps the line", () => {
    expect(
      parseExplorerTreeUrl(`${node}/rad:${repo00}/tree/main/src/lib.rs#L10`),
    ).toEqual({ repo: repo00, path: "main/src/lib.rs", fragment: "L10" });
  });

  test("drops a fragment a URI cannot hold", () => {
    expect(
      parseExplorerUrl(`${node}/rad:${repo00}/tree/${oid}/src#a{b}`),
    ).toMatchObject({ uri: { fragment: undefined } });
  });

  test("only files carry a fragment onto the explorer", () => {
    expect(
      explorerUrl(
        parseReference(`rad:${repo00}/commit/${oid}#L10`)!,
        base,
        "seed",
      ),
    ).toBe(`${node}/rad:${repo00}/commits/${oid}`);
  });
});

describe("explorer paths stay on the page they name", () => {
  const base = "https://radicle.network";
  const link = (input: string) =>
    explorerUrl(parseReference(input)!, base, "seed");

  test.each([
    `rad:${repo00}/commit/../..`,
    `rad:${repo00}/commit/main?path=../../users`,
    `rad:${repo00}/commit/main?path=src/./lib`,
  ])("has no page for %s", input => {
    expect(link(input)).toBeUndefined();
  });

  test("encodes characters a path segment cannot hold", () => {
    expect(link(`rad:${repo00}/commit/main?path=a?b`)).toBe(
      `${base}/nodes/seed/rad:${repo00}/tree/main/a%3Fb`,
    );
  });
});

test.each([
  ["main", true],
  ["feature/x", true],
  ["v1.0", true],
  [oid, true],
  ["..", false],
  ["a/../b", false],
  ["a..b", false],
  [".hidden", false],
  ["main.lock", false],
  ["v1.", false],
])("isSafeRef(%j) is %j", (ref, expected) => {
  expect(isSafeRef(ref)).toBe(expected);
});
