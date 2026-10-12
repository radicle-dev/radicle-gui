import type { AliasSuggestion } from "@bindings/cob/AliasSuggestion";

import { describe, expect, test } from "vitest";

import {
  matchesAssignee,
  rankAssigneeSuggestions,
} from "@app/lib/assigneeSuggestions";

const self = "did:key:z6MkSelf";
const delegate = "did:key:z6MkDelegate";
const followed = "did:key:z6MkFollowed";
const known = "did:key:z6MkKnown";
const plain = "did:key:z6MkPlain";

function alias(
  did: string,
  name: string | undefined,
  extra: Partial<AliasSuggestion> = {},
): AliasSuggestion {
  return { did, alias: name, followed: false, isSelf: false, ...extra };
}

const aliases = [
  alias(plain, undefined),
  alias(followed, "fiona", { followed: true }),
  alias(known, "kim"),
  alias(self, "alice", { isSelf: true }),
];

function rank(
  overrides: Partial<Parameters<typeof rankAssigneeSuggestions>[0]> = {},
) {
  return rankAssigneeSuggestions({
    query: "",
    aliases,
    delegates: [{ did: delegate, alias: "dave" }],
    assignees: [],
    limit: 10,
    ...overrides,
  });
}

describe("rankAssigneeSuggestions", () => {
  test("orders you, delegates, aliased people, then bare DIDs", () => {
    expect(rank().map(({ did }) => did)).toEqual([
      self,
      delegate,
      followed,
      known,
      plain,
    ]);
  });

  test("badges each group", () => {
    expect(rank().map(({ badge }) => badge)).toEqual([
      "you",
      "delegate",
      "following",
      undefined,
      undefined,
    ]);
  });

  test("leaves out people who are already assigned", () => {
    const dids = rank({ assignees: [{ did: self }, { did: delegate }] }).map(
      ({ did }) => did,
    );
    expect(dids).toEqual([followed, known, plain]);
  });

  test("filters delegates by alias or DID, ignoring case", () => {
    const delegates = [{ did: delegate, alias: "dave" }];
    const dids = (query: string) =>
      rank({ query, aliases: [], delegates }).map(({ did }) => did);

    expect(dids("DAV")).toEqual([delegate]);
    expect(dids("z6mkdeleg")).toEqual([delegate]);
    expect(dids(" did:key:z6MkDeleg ")).toEqual([delegate]);
    expect(dids("zzz")).toEqual([]);
  });

  test("doesn't match delegates on the DID prefix or mid-key", () => {
    const delegates = [{ did: delegate, alias: "dave" }];
    const dids = (query: string) =>
      rank({ query, aliases: [], delegates }).map(({ did }) => did);

    expect(dids("k")).toEqual([]);
    expect(dids("did:")).toEqual([]);
    expect(dids("Delegate")).toEqual([]);
  });

  test("lists a delegate who is also a search result once", () => {
    const result = rank({
      aliases: [alias(delegate, "dave", { followed: true })],
    });
    expect(result).toEqual([
      { did: delegate, alias: "dave", badge: "delegate" },
    ]);
  });

  test("marks yourself as you even when you are a delegate", () => {
    const result = rank({
      delegates: [{ did: self, alias: "alice" }],
    });
    expect(result[0]).toEqual({ did: self, alias: "alice", badge: "you" });
    expect(result.filter(({ did }) => did === self)).toHaveLength(1);
  });

  test("caps the list at the limit", () => {
    expect(rank({ limit: 2 })).toHaveLength(2);
  });
});

describe("matchesAssignee", () => {
  const author = { did: "did:key:z6MkAlice", alias: "alice" };

  test("matches the alias anywhere and the key from its start", () => {
    expect(matchesAssignee("lic", author)).toBe(true);
    expect(matchesAssignee("z6mka", author)).toBe(true);
    expect(matchesAssignee("did:key:z6MkA", author)).toBe(true);
    expect(matchesAssignee("Alice", author)).toBe(true);
  });

  test("rejects other text", () => {
    expect(matchesAssignee("bob", author)).toBe(false);
    expect(matchesAssignee("key", author)).toBe(false);
  });
});
