import type { Artifact } from "@bindings/cob/release/Artifact";
import type { ReleaseCounts } from "@bindings/cob/release/ReleaseCounts";
import type { Commit } from "@bindings/repo/Commit";

import { describe, expect, test } from "vitest";

import {
  artifactView,
  attestedBy,
  canAttest,
  canEditMetadata,
  delegatesFirst,
  displayMetadataValue,
  locationsByNode,
  matchCommits,
  parseMetadataValue,
  redactedByDelegate,
  releaseListScope,
  releaseWarning,
  webLocations,
} from "@app/lib/releases";

const me = "did:key:z6MkMe";
const them = "did:key:z6MkThem";
const delegate = "did:key:z6MkDelegate";
const delegates = new Set([delegate]);

function artifact(cid: string, overrides: Partial<Artifact> = {}): Artifact {
  return {
    cid,
    name: cid,
    directory: false,
    author: { did: delegate },
    locations: [],
    attestations: [],
    redactions: [],
    redacted: false,
    metadata: {},
    ...overrides,
  };
}

function counts(delegate: number, other: number): ReleaseCounts {
  return { delegate, delegateRedacted: 0, other, otherRedacted: 0 };
}

describe("releaseListScope", () => {
  test("keeps a requested scope", () => {
    expect(releaseListScope("trusted", counts(0, 3))).toBe("trusted");
  });

  test("opens on untrusted when only others released", () => {
    expect(releaseListScope(undefined, counts(0, 3))).toBe("untrusted");
  });

  test.each([
    [1, 3],
    [0, 0],
  ])("opens on trusted with %d delegate and %d other", (d, o) => {
    expect(releaseListScope(undefined, counts(d, o))).toBe("trusted");
  });
});

describe("artifactView", () => {
  const ours = artifact("ours");
  const ourRedacted = artifact("ours-redacted", { redacted: true });
  const theirs = artifact("theirs", { author: { did: them } });

  test("shows the wanted scope", () => {
    const view = artifactView([ours, theirs], delegates, "untrusted", false);
    expect(view.scope).toBe("untrusted");
    expect(view.shown).toEqual([theirs]);
    expect(view.showFilters).toBe(true);
  });

  test("falls back to the other scope when the wanted one is empty", () => {
    const view = artifactView([theirs], delegates, "trusted", false);
    expect(view.scope).toBe("untrusted");
    expect(view.shown).toEqual([theirs]);
    expect(view.showFilters).toBe(false);
  });

  test("hides redacted artifacts unless asked", () => {
    const hidden = artifactView(
      [ours, ourRedacted],
      delegates,
      "trusted",
      false,
    );
    expect(hidden.shown).toEqual([ours]);
    expect(hidden.redactedCount).toBe(1);
    expect(hidden.counts.trusted).toBe(1);

    const shown = artifactView([ours, ourRedacted], delegates, "trusted", true);
    expect(shown.shown).toEqual([ours, ourRedacted]);
    expect(shown.counts.trusted).toBe(2);
  });

  test("keeps a scope whose artifacts are all redacted", () => {
    const view = artifactView(
      [ourRedacted, theirs],
      delegates,
      "trusted",
      false,
    );
    expect(view.scope).toBe("trusted");
    expect(view.shown).toEqual([]);
    expect(view.counts).toEqual({ trusted: 0, untrusted: 1 });
  });

  test("counts redactions within the current scope only", () => {
    const theirRedacted = artifact("theirs-redacted", {
      author: { did: them },
      redacted: true,
    });
    const view = artifactView(
      [ours, theirs, theirRedacted],
      delegates,
      "trusted",
      false,
    );
    expect(view.redactedCount).toBe(0);
  });
});

test("redactedByDelegate tells a delegate's redaction from others'", () => {
  const byAuthor = artifact("a", {
    author: { did: them },
    redactions: [{ user: { did: them }, reason: "" }],
  });
  const byDelegate = artifact("b", {
    redactions: [
      { user: { did: them }, reason: "" },
      { user: { did: delegate }, reason: "" },
    ],
  });
  expect(redactedByDelegate(byAuthor, delegates)).toBe(false);
  expect(redactedByDelegate(byDelegate, delegates)).toBe(true);
});

test("locationsByNode groups by node in first-seen order", () => {
  expect(
    locationsByNode([
      { user: { did: them }, url: "a" },
      { user: { did: me }, url: "b" },
      { user: { did: them }, url: "c" },
    ]),
  ).toEqual([
    { user: { did: them }, urls: ["a", "c"] },
    { user: { did: me }, urls: ["b"] },
  ]);
});

test("delegatesFirst moves delegates up and keeps order within groups", () => {
  const items = [them, delegate, me, `${delegate}2`];
  const result = delegatesFirst(
    items,
    did => did,
    new Set([delegate, `${delegate}2`]),
  );
  expect(result).toEqual([delegate, `${delegate}2`, them, me]);
  expect(items[0]).toBe(them);
});

test("webLocations keeps http(s) URLs, delegates first", () => {
  const theirs = { user: { did: them }, url: "https://them.example/a" };
  const ours = { user: { did: delegate }, url: "HTTP://us.example/a" };
  expect(
    webLocations(
      [theirs, { user: { did: delegate }, url: "radiroh://" }, ours],
      delegates,
    ),
  ).toEqual([ours, theirs]);
});

describe("attestedBy", () => {
  test("is zero without attestations", () => {
    expect(attestedBy([], delegates)).toBe(0);
  });

  test("counts only delegates", () => {
    expect(
      attestedBy([{ did: them }, { did: delegate }, { did: me }], delegates),
    ).toBe(1);
  });

  test("ignores attestations by others", () => {
    expect(attestedBy([{ did: them }, { did: me }], delegates)).toBe(0);
  });
});

describe("canAttest", () => {
  test("lets others attest", () => {
    expect(canAttest(artifact("a"), me)).toBe(true);
  });

  test.each<[string, Partial<Artifact>]>([
    ["its author", { author: { did: me } }],
    ["a trusted redaction", { redacted: true }],
    ["an earlier attestation", { attestations: [{ did: me }] }],
    ["your own redaction", { redactions: [{ user: { did: me }, reason: "" }] }],
  ])("is barred by %s", (_, overrides) => {
    expect(canAttest(artifact("a", overrides), me)).toBe(false);
  });
});

describe("canEditMetadata", () => {
  const theirs = artifact("a", { author: { did: them } });

  test.each([
    [them, true],
    [delegate, true],
    [me, false],
  ])("%s can edit: %s", (did, expected) => {
    expect(canEditMetadata(theirs, did, delegates)).toBe(expected);
  });
});

describe("metadata values", () => {
  test.each<[string, unknown]>([
    ["42", 42],
    ["true", true],
    ['{"a":1}', { a: 1 }],
    ["x86_64", "x86_64"],
    ['"quoted"', "quoted"],
  ])("%s parses to %j and displays back", (input, value) => {
    expect(parseMetadataValue(input)).toEqual(value);
    expect(parseMetadataValue(displayMetadataValue(value))).toEqual(value);
  });

  test("shows a string as it is, without JSON quotes", () => {
    expect(displayMetadataValue("x86_64")).toBe("x86_64");
  });
});

describe("matchCommits", () => {
  function commit(id: string, summary: string): Commit {
    const person = { name: "", email: "", time: 0 };
    return {
      id,
      summary,
      message: summary,
      author: person,
      committer: person,
      parents: [],
    };
  }
  const first = commit("abc123", "Add notes");
  const second = commit("def456", "Fix build");
  const pasted = commit("fff999", "Old change");

  test.each([
    ["", [first, second]],
    ["ABC", [first]],
    ["  fix ", [second]],
    ["123", []],
  ])("%j matches", (query, expected) => {
    expect(matchCommits([first, second], query, undefined)).toEqual(expected);
  });

  test("offers a resolved commit outside the loaded history", () => {
    expect(matchCommits([first, second], "fff999", pasted)).toEqual([pasted]);
  });

  test("keeps the matches when the resolved commit is among them", () => {
    expect(matchCommits([first, second], "", first)).toEqual([first, second]);
  });
});

describe("releaseWarning", () => {
  test("warns about a whole release by a non-delegate", () => {
    expect(releaseWarning(them, delegates, "trusted")).toBe("release");
    expect(releaseWarning(them, delegates, "untrusted")).toBe("release");
  });

  test("warns about others' artifacts on a delegate's release", () => {
    expect(releaseWarning(delegate, delegates, "untrusted")).toBe("artifacts");
  });

  test("does not warn about a delegate's release and artifacts", () => {
    expect(releaseWarning(delegate, delegates, "trusted")).toBeUndefined();
  });
});
