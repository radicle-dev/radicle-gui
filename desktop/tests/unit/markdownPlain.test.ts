import { expect, test } from "vitest";

import { plainText } from "@app/lib/markdownPlain";

test.each([
  ["[the docs](https://example.com)", "the docs"],
  ["![diagram](a.png) here", "diagram here"],
  ["run `npm test` now", "run npm test now"],
  ["~~old~~ new", "old new"],
  ["**bold** and _italic_", "bold and italic"],
  ["__strong__ and *em*", "strong and em"],
  ["# Heading", "Heading"],
  ["### Deep heading", "Deep heading"],
  ["> quoted\n> text", "quoted text"],
  ["- one\n* two\n+ three\n1. four", "one two three four"],
  ["line one\n\n  line two", "line one line two"],
  ["  padded  ", "padded"],
])("%j reads as %j", (markdown, expected) => {
  expect(plainText(markdown)).toBe(expected);
});

test.each([
  "snake_case_name",
  "MAX_SIZE",
  "_private",
  "see _foo_bar",
  "a*b*c",
  "2 * 3 * 4",
])("leaves %j alone", text => {
  expect(plainText(text)).toBe(text);
});
