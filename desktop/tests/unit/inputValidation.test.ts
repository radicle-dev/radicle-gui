import { describe, expect, test } from "vitest";

import {
  aliasErrors,
  labelError,
  parseAssignee,
} from "@app/lib/inputValidation";

const nid = "z6MkqGC3nWZhYieEVTVDKW5v588CiGfsDSmRVG9ZwwWTvLSK";

test.each([
  ["alice", []],
  ["", ["AliasError.EmptyAlias"]],
  ["a".repeat(32), []],
  ["a".repeat(33), ["AliasError.TooLongAlias"]],
  ["a b", ["AliasError.InvalidAlias"]],
  [
    `${"a ".repeat(17)}`,
    ["AliasError.TooLongAlias", "AliasError.InvalidAlias"],
  ],
])("aliasErrors(%j) is %j", (alias, expected) => {
  expect(aliasErrors(alias)).toEqual(expected);
});

test("labelError flags a label that is already assigned", () => {
  expect(labelError(" bug ", ["bug"])).toBe("This label is already assigned");
  expect(labelError("feature", ["bug"])).toBeUndefined();
  expect(labelError("  ", ["bug"])).toBeUndefined();
});

describe("parseAssignee", () => {
  test("accepts a NID or a DID", () => {
    expect(parseAssignee(nid, [])).toEqual({ did: `did:key:${nid}` });
    expect(parseAssignee(`did:key:${nid}`, [])).toEqual({
      did: `did:key:${nid}`,
    });
  });

  test("ignores surrounding whitespace", () => {
    expect(parseAssignee(` ${nid} `, [])).toEqual({ did: `did:key:${nid}` });
    expect(parseAssignee(` did:key:${nid}`, [])).toEqual({
      did: `did:key:${nid}`,
    });
  });

  test("rejects an assignee that is already added", () => {
    expect(parseAssignee(nid, [{ did: `did:key:${nid}` }])).toEqual({
      error: "This assignee is already added",
    });
  });

  test("rejects a malformed DID", () => {
    expect(parseAssignee("did:key:alice", [])).toEqual({
      error: "This is not a valid DID",
    });
  });

  test("treats other input as a search, not an error", () => {
    expect(parseAssignee("alice", [])).toEqual({});
    expect(parseAssignee("z6Mkq", [])).toEqual({});
    expect(parseAssignee("", [])).toEqual({});
  });
});
