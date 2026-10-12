import type { Config } from "@bindings/config/Config";

import { describe, expect, test, vi } from "vitest";

import {
  coAuthors,
  creditedCoAuthors,
  explorerHost,
  explorerLink,
  formatBytes,
  formatGitIdentity,
  formatRepositoryId,
  formatTimestamp,
  formatUptime,
  identityKey,
  isPublishableReview,
  parseNodeId,
  parseRepositoryId,
  pluralize,
  revisionPosition,
  safeHttpUrl,
  shortenCids,
  truncateDid,
  unqualifyBranch,
} from "@app/lib/utils";

const rid = "rad:z3fpY7nttPPa6MBnAv2DccHzQJnqe";
const nid = "z6MkqGC3nWZhYieEVTVDKW5v588CiGfsDSmRVG9ZwwWTvLSK";

describe("safeHttpUrl", () => {
  test.each([
    ["http://example.com/", "http://example.com/"],
    ["https://example.com/path?a=1&b=2", "https://example.com/path?a=1&b=2"],
    ["HTTP://EXAMPLE.com/Path", "http://example.com/Path"],
    ["http://example.com/<script>", "http://example.com/%3Cscript%3E"],
  ])("accepts %j", (input, expected) => {
    expect(safeHttpUrl(input)).toBe(expected);
  });

  test.each([
    "javascript:alert(1)",
    "\tjavascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//example.com",
    "/relative/path",
    "relative",
    "",
    "not a url",
  ])("rejects %j", input => {
    expect(safeHttpUrl(input)).toBeUndefined();
  });
});

describe("coAuthors", () => {
  test("reads trailers from the final paragraph", () => {
    expect(
      coAuthors(
        "Fix the thing\n\nSome body text.\n\nSigned-off-by: A <a@x>\nCo-authored-by: Alice Lidell <alice@lidell.com>\nCo-authored-by: Bob <bob@example.com>",
      ),
    ).toEqual([
      { name: "Alice Lidell", email: "alice@lidell.com" },
      { name: "Bob", email: "bob@example.com" },
    ]);
  });

  test("is case-insensitive", () => {
    expect(
      coAuthors("Subject\n\nCO-AUTHORED-BY: Bob <bob@example.com>"),
    ).toEqual([{ name: "Bob", email: "bob@example.com" }]);
  });

  test("ignores a trailer that is not in the last paragraph", () => {
    expect(
      coAuthors(
        "Subject\n\nCo-authored-by: Bob <bob@example.com>\n\nThat line was quoted, not a trailer.",
      ),
    ).toEqual([]);
  });

  test("keeps the last paragraph rule for CRLF messages", () => {
    expect(
      coAuthors(
        "Subject\r\n\r\nCo-authored-by: Bob <bob@example.com>\r\n\r\nThat line was quoted, not a trailer.\r\n",
      ),
    ).toEqual([]);
  });

  test("reads a trailer that carries no name", () => {
    expect(coAuthors("Subject\n\nCo-authored-by: <bob@example.com>")).toEqual([
      { name: "", email: "bob@example.com" },
    ]);
  });

  test("ignores malformed lines", () => {
    expect(
      coAuthors(
        "Subject\n\nCo-authored-by: Bob\nCo-authored-by:\nNot-a-trailer: x <y@z>",
      ),
    ).toEqual([]);
  });

  test("returns nothing when there are no trailers", () => {
    expect(coAuthors("Subject\n\nJust a body.")).toEqual([]);
  });
});

describe("parseRepositoryId", () => {
  test("parses a RID with and without the rad: prefix", () => {
    expect(parseRepositoryId(rid)).toEqual({
      prefix: "rad:",
      pubkey: "z3fpY7nttPPa6MBnAv2DccHzQJnqe",
    });
    expect(parseRepositoryId("z3fpY7nttPPa6MBnAv2DccHzQJnqe")).toEqual({
      prefix: "rad:",
      pubkey: "z3fpY7nttPPa6MBnAv2DccHzQJnqe",
    });
  });

  test.each([
    "",
    "rad:",
    "rad:z3fpY7ntt",
    `${rid} `,
    "rad:x3fpY7nttPPa6MBn",
    // Base58 has no 0, O, I or l.
    "rad:z0OIl",
  ])("rejects %j", input => {
    expect(parseRepositoryId(input)).toBeUndefined();
  });
});

describe("formatRepositoryId", () => {
  test("truncates a valid RID", () => {
    expect(formatRepositoryId(rid)).toBe("rad:z3fpY7…zQJnqe");
  });

  test("returns an invalid RID unchanged", () => {
    expect(formatRepositoryId("not-a-rid")).toBe("not-a-rid");
  });
});

describe("parseNodeId", () => {
  test("parses a NID with and without the did:key: prefix", () => {
    expect(parseNodeId(nid)).toEqual({ prefix: "did:key:", pubkey: nid });
    expect(parseNodeId(`did:key:${nid}`)).toEqual({
      prefix: "did:key:",
      pubkey: nid,
    });
  });

  test("rejects a RID", () => {
    expect(parseNodeId("z3fpY7nttPPa6MBnAv2DccHzQJnqe")).toBeUndefined();
  });

  test("rejects input that is not base58", () => {
    vi.spyOn(console, "error").mockReturnValue(undefined);
    expect(parseNodeId("z0OIl")).toBeUndefined();
  });
});

test("truncateDid", () => {
  expect(truncateDid(`did:key:${nid}`)).toBe("did:key:z6MkqG…WTvLSK");
});

test.each([
  ["refs/heads/main", "main"],
  ["refs/heads/feature/x", "feature/x"],
  ["main", "main"],
  ["refs/tags/v1", "refs/tags/v1"],
])("unqualifyBranch(%j) is %j", (input, expected) => {
  expect(unqualifyBranch(input)).toBe(expected);
});

describe("formatTimestamp", () => {
  const now = Date.UTC(2026, 0, 1);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  test.each([
    [0, "now"],
    [59 * 1000, "now"],
    [minute, "1m"],
    [59 * minute, "59m"],
    [hour, "1h"],
    [23 * hour, "23h"],
    [day, "1d"],
    [30 * day, "30d"],
    [31 * day, "1mo"],
    [364 * day, "11mo"],
    [365 * day, "1y"],
    [3 * 365 * day, "3y"],
  ])("%j ms ago is %j", (elapsed, expected) => {
    expect(formatTimestamp(now - elapsed, now)).toBe(expected);
  });
});

test.each([
  ["issue", 0, "issues"],
  ["issue", 1, "issue"],
  ["issue", 2, "issues"],
  ["patch", 2, "patches"],
  ["box", 2, "boxes"],
  ["class", 2, "classes"],
])("pluralize(%j, %j) is %j", (singular, count, expected) => {
  expect(pluralize(singular, count)).toBe(expected);
});

test("revisionPosition", () => {
  const revisions = [{ id: "a" }, { id: "b" }, { id: "c" }];
  expect(revisionPosition(revisions, "a")).toBe(1);
  expect(revisionPosition(revisions, "c")).toBe(3);
  expect(revisionPosition(revisions, "x")).toBeUndefined();
});

describe("identityKey", () => {
  test("matches identities by email case-insensitively", () => {
    expect(identityKey({ name: "Alice", email: " Alice@Example.com " })).toBe(
      identityKey({ name: "A. Lidell", email: "alice@example.com" }),
    );
  });

  test("falls back to the name when there is no email", () => {
    expect(identityKey({ name: "Alice", email: "" })).toBe("name:alice");
    expect(identityKey({ name: "Alice", email: "" })).not.toBe(
      identityKey({ name: "Bob", email: "" }),
    );
  });
});

describe("explorer links", () => {
  function config(overrides: Partial<Config>): Config {
    return {
      publicExplorer: "https://radicle.network/nodes/$host/$rid$path",
      preferredSeeds: [],
      ...overrides,
    } as Config;
  }

  const repo = { type: "uri", uri: { repo: rid.slice(4) } } as const;

  test("uses the first preferred seed host", () => {
    expect(
      explorerLink(
        repo,
        config({
          preferredSeeds: [
            `${nid}@seed.example.com:8776`,
            `${nid}@other.example.com:8776`,
          ],
        }),
      ),
    ).toBe(`https://radicle.network/nodes/seed.example.com/${rid}`);
  });

  test("falls back to the default seed", () => {
    expect(explorerLink(repo, config({}))).toBe(
      `https://radicle.network/nodes/rosa.radicle.network/${rid}`,
    );
  });

  test("explorerHost returns the host of the template", () => {
    expect(explorerHost(config({}))).toBe("radicle.network");
  });

  test("explorerHost returns an unparseable template unchanged", () => {
    expect(explorerHost(config({ publicExplorer: "not a url" }))).toBe(
      "not a url",
    );
  });
});

describe("isPublishableReview", () => {
  test.each([
    ["accept", "", true],
    ["reject", " ", true],
    [undefined, "Looks fine", true],
    [undefined, " \n", false],
  ] as const)(
    "a %j review with summary %j can be published: %j",
    (verdict, summary, expected) => {
      expect(isPublishableReview(verdict, summary)).toBe(expected);
    },
  );
});

describe("commit credits", () => {
  const alice = { name: "Alice", email: "alice@example.com" };
  const bob = { name: "Bob", email: "bob@example.com" };
  const carol = { name: "Carol", email: "carol@example.com" };

  test("formatGitIdentity writes a trailer identity", () => {
    expect(formatGitIdentity(alice)).toBe("Alice <alice@example.com>");
    expect(formatGitIdentity({ name: "", email: "a@b.c" })).toBe("a@b.c");
  });

  test("creditedCoAuthors skips the author, the committer and repeats", () => {
    const message = [
      "Squashed",
      "",
      "Co-authored-by: Alice <ALICE@example.com>",
      "Co-authored-by: Bob <bob@example.com>",
      "Co-authored-by: Carol <carol@example.com>",
      "Co-authored-by: Carol C. <Carol@example.com>",
    ].join("\n");

    expect(
      creditedCoAuthors({ author: alice, committer: bob, message }),
    ).toEqual([carol]);
  });
});

describe("formatBytes", () => {
  test.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KiB"],
    [1536, "1.5 KiB"],
    [10 * 1024 - 1, "10.0 KiB"],
    [10 * 1024, "10 KiB"],
    [1024 ** 2, "1.0 MiB"],
    [1024 ** 4, "1.0 TiB"],
    [1024 ** 5, "1024 TiB"],
  ])("%d is %j", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("formatUptime", () => {
  test.each([
    [0, "0s"],
    [59.9, "59s"],
    [60, "1m"],
    [3599, "59m"],
    [3600, "1h"],
    [86399, "23h"],
    [86400, "1d"],
    [86400 * 400, "400d"],
  ])("%d is %j", (seconds, expected) => {
    expect(formatUptime(seconds)).toBe(expected);
  });
});

describe("shortenCids", () => {
  const prefix = "bafkr4i";

  test("returns nothing for no ids", () => {
    expect(shortenCids([]).size).toBe(0);
  });

  test("keeps the minimum head when ids differ early", () => {
    const a = "abcdefghij0123456789";
    const b = "zbcdefghij9876543210";
    const labels = shortenCids([a, b]);
    expect(labels.get(a)).toBe("abcdefg…456789");
    expect(labels.get(b)).toBe("zbcdefg…543210");
  });

  test("grows the head past a shared prefix until ids differ", () => {
    const a = `${prefix}aaaa${"x".repeat(20)}111111`;
    const b = `${prefix}aaab${"x".repeat(20)}111111`;
    const labels = shortenCids([a, b]);
    expect(labels.get(a)).toBe(`${prefix}aaaa…111111`);
    expect(labels.get(b)).toBe(`${prefix}aaab…111111`);
  });

  test("stops growing the head at the maximum", () => {
    const a = `${"p".repeat(20)}a${"x".repeat(10)}`;
    const b = `${"p".repeat(20)}b${"x".repeat(10)}`;
    expect(shortenCids([a, b]).get(a)).toBe(`${"p".repeat(16)}…xxxxxx`);
  });

  test("shows an id in full when head and tail cover it", () => {
    const short = "abcdefghijklm";
    expect(shortenCids([short]).get(short)).toBe(short);
  });

  test("labels repeated ids once", () => {
    const a = "abcdefghij0123456789";
    expect(shortenCids([a, a]).size).toBe(1);
  });
});
