import { describe, expect, test } from "vitest";

import { highlightSegments } from "@app/lib/utils";

describe("highlightSegments", () => {
  test("wraps matched runs and escapes every run", () => {
    expect(
      highlightSegments([
        { text: "Crash on ", match: false },
        { text: "start", match: true },
      ]),
    ).toEqual("Crash on <mark>start</mark>");
  });

  test("escapes HTML in both matched and unmatched runs", () => {
    expect(
      highlightSegments([
        { text: "<script>", match: false },
        { text: "a & b", match: true },
      ]),
    ).toEqual("&lt;script&gt;<mark>a &amp; b</mark>");
  });

  test("leaves backticks intact so code spans still format", () => {
    expect(
      highlightSegments([
        { text: "fix `read", match: false },
        { text: "me", match: true },
        { text: "` typo", match: false },
      ]),
    ).toEqual("fix `read<mark>me</mark>` typo");
  });

  test("handles an all-match title", () => {
    expect(highlightSegments([{ text: "everything", match: true }])).toEqual(
      "<mark>everything</mark>",
    );
  });
});
