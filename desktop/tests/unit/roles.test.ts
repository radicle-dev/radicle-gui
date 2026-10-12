import { describe, expect, test } from "vitest";

import {
  canResolveReviewComment,
  isDelegate,
  isDelegateOrAuthor,
} from "@app/lib/roles";

const me = "z6Mkme";
const delegates = ["did:key:z6Mkdelegate", "did:key:z6Mkother"];

describe("isDelegate", () => {
  test("matches a delegate's public key", () => {
    expect(isDelegate("z6Mkdelegate", delegates)).toBe(true);
  });

  test.each([[me], [undefined]])("is undefined for %j", key => {
    expect(isDelegate(key, delegates)).toBeUndefined();
  });
});

describe("isDelegateOrAuthor", () => {
  test("allows delegates and the author", () => {
    expect(isDelegateOrAuthor("z6Mkdelegate", delegates, "did:key:x")).toBe(
      true,
    );
    expect(isDelegateOrAuthor(me, delegates, `did:key:${me}`)).toBe(true);
  });

  test("is undefined for anyone else", () => {
    expect(isDelegateOrAuthor(me, delegates, "did:key:x")).toBeUndefined();
    expect(
      isDelegateOrAuthor(undefined, delegates, "did:key:x"),
    ).toBeUndefined();
  });
});

describe("canResolveReviewComment", () => {
  const nobody = { comment: undefined, review: undefined, revision: undefined };

  test("a delegate can resolve any review comment", () => {
    expect(canResolveReviewComment("z6Mkdelegate", delegates, nobody)).toBe(
      true,
    );
  });

  test.each(["comment", "review", "revision"] as const)(
    "the %s author can resolve it",
    role => {
      expect(
        canResolveReviewComment(me, delegates, {
          ...nobody,
          [role]: `did:key:${me}`,
        }),
      ).toBe(true);
    },
  );

  test("nobody else can", () => {
    expect(
      canResolveReviewComment(me, delegates, {
        comment: "did:key:a",
        review: "did:key:b",
        revision: "did:key:c",
      }),
    ).toBe(false);
  });
});
