import { describe, expect, test } from "vitest";

import { previousOption, revisionRange } from "@app/lib/revisionCompare";

import { revision } from "./support/cobs";

const r1 = revision({ id: "r1", base: "base", head: "one" });
const r2 = revision({ id: "r2", base: "base", head: "two" });
const r3 = revision({ id: "r3", base: "base", head: "three" });

describe("revisionRange", () => {
  test("pairs a revision with the one before it in timeline order", () => {
    expect(revisionRange([r1, r2, r3], "r3")).toEqual({
      base: "base",
      head: "three",
      previous: r2,
    });
  });

  test("the first revision has no previous one", () => {
    expect(revisionRange([r1, r2], "r1")?.previous).toBeUndefined();
  });

  test("a revision that isn't listed has no range", () => {
    expect(revisionRange([r1, r2], "r4")).toBeUndefined();
    expect(revisionRange([], "r1")).toBeUndefined();
  });
});

describe("previousOption", () => {
  test("is absent for the first revision", () => {
    expect(previousOption({ base: "base", head: "one" })).toBeUndefined();
  });

  test("diffs against the previous head on the same base", () => {
    const option = previousOption({ base: "base", head: "two", previous: r1 });
    expect(option).toMatchObject({ id: "r1", disabled: false, from: "one" });
  });

  test("is disabled when the base moved", () => {
    const previous = revision({ id: "r1", base: "old", head: "one" });
    expect(
      previousOption({ base: "base", head: "two", previous })?.disabled,
    ).toBe(true);
  });

  test("is disabled when both revisions are the same commit", () => {
    expect(
      previousOption({ base: "base", head: "one", previous: r1 })?.disabled,
    ).toBe(true);
  });

  test("is disabled when the previous revision is empty", () => {
    const previous = revision({ id: "r1", base: "base", head: "base" });
    expect(
      previousOption({ base: "base", head: "two", previous })?.disabled,
    ).toBe(true);
  });
});
