import { describe, expect, test } from "vitest";

import type { MarkdownFormat } from "@app/lib/markdownFormat";
import {
  applyMarkdownFormat,
  applyTextEdit,
  pasteLinkEdit,
} from "@app/lib/markdownFormat";

// Pipes mark the selection in both the input and the output.
function format(input: string, kind: MarkdownFormat): string {
  const start = input.indexOf("|");
  const end = input.indexOf("|", start + 1) - 1;
  const value = input.replaceAll("|", "");
  const edit = applyMarkdownFormat(kind, value, start, end);
  const result = applyTextEdit(value, edit);

  return result
    .substring(0, edit.selectionStart)
    .concat(
      "|",
      result.substring(edit.selectionStart, edit.selectionEnd),
      "|",
      result.substring(edit.selectionEnd),
    );
}

describe("bold", () => {
  test.each([
    ["a |word| here", "a **|word|** here"],
    ["a ||word", "a **||**word"],
    ["a **|word|** here", "a |word| here"],
    ["a |**word**| here", "a |word| here"],
    ["a **||** here", "a || here"],
  ])("%j => %j", (input, expected) => {
    expect(format(input, "bold")).toBe(expected);
  });
});

describe("italic", () => {
  test.each([
    ["a |word| here", "a _|word|_ here"],
    ["a _|word|_ here", "a |word| here"],
    ["a |_word_| here", "a |word| here"],
    ["**|word|**", "**_|word|_**"],
  ])("%j => %j", (input, expected) => {
    expect(format(input, "italic")).toBe(expected);
  });
});

describe("code", () => {
  test.each([
    ["a |word| here", "a `|word|` here"],
    ["a `|word|` here", "a |word| here"],
    ["|one\ntwo|", "```\n|one\ntwo|\n```"],
    ["```\n|one\ntwo|\n```", "|one\ntwo|"],
    ["a |one\ntwo| b", "a \n```\n|one\ntwo|\n```\n b"],
    ["a\n|one\ntwo|\nb", "a\n```\n|one\ntwo|\n```\nb"],
  ])("%j => %j", (input, expected) => {
    expect(format(input, "code")).toBe(expected);
  });
});

describe("link", () => {
  test.each([
    ["see |docs| now", "see [docs](||) now"],
    ["see || now", "see [](||) now"],
    ["see |https://radicle.xyz| now", "see [||](https://radicle.xyz) now"],
  ])("%j => %j", (input, expected) => {
    expect(format(input, "link")).toBe(expected);
  });
});

describe("pasteLinkEdit", () => {
  test("wraps the selection and leaves the caret after the link", () => {
    const value = "Read the docs here";
    const edit = pasteLinkEdit(value, 9, 13, "https://radicle.xyz");

    expect(edit && applyTextEdit(value, edit)).toBe(
      "Read the [docs](https://radicle.xyz) here",
    );
    expect(edit?.selectionStart).toBe(36);
    expect(edit?.selectionEnd).toBe(36);
  });

  test("falls through without a selection", () => {
    expect(pasteLinkEdit("docs", 2, 2, "https://radicle.xyz")).toBeUndefined();
  });

  test.each([
    ["https://example.com", "https://example.com"],
    ["http://example.com/a?b=1#c", "http://example.com/a?b=1#c"],
    ["  https://example.com/path  ", "https://example.com/path"],
    [
      "https://app.radicle.xyz/nodes/iris.radicle.xyz/rad:z4D5U/issues/7bdaa5a",
      "https://app.radicle.xyz/nodes/iris.radicle.xyz/rad:z4D5U/issues/7bdaa5a",
    ],
  ])("links %j", (pasted, url) => {
    expect(pasteLinkEdit("docs", 0, 4, pasted)?.text).toBe(`[docs](${url})`);
  });

  test.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "rad:z4D5UCArafTzTQpDZNQRuqswh3ury",
    "https://example.com and more",
    "https://example.com\nhttps://example.org",
    "just some words",
    "  ",
    "",
  ])("falls through for %j", pasted => {
    expect(pasteLinkEdit("docs", 0, 4, pasted)).toBeUndefined();
  });
});
