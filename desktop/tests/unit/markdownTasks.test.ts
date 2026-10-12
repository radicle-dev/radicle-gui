import { describe, expect, test } from "vitest";

import { toggleTask } from "@app/lib/markdown";

describe("toggleTask", () => {
  test.each([
    ["ticks an open box", "- [ ] a\n- [ ] b", 0, "- [x] a\n- [ ] b"],
    ["clears a ticked box", "- [ ] a\n- [x] b", 1, "- [ ] a\n- [ ] b"],
    ["clears an upper-case box", "- [X] a", 0, "- [ ] a"],
    ["works on ordered lists", "1. [ ] a\n2) [ ] b", 1, "1. [ ] a\n2) [x] b"],
    [
      "works on nested items",
      "- a\n  - [ ] n\n- [x] b",
      0,
      "- a\n  - [x] n\n- [x] b",
    ],
    ["works inside a blockquote", "> - [ ] q", 0, "> - [x] q"],
    [
      "keeps CRLF line endings",
      "- [ ] a\r\n- [x] b\r\n",
      0,
      "- [x] a\r\n- [x] b\r\n",
    ],
    [
      "keeps frontmatter",
      "---\nx: 1\n---\n- [ ] a",
      0,
      "---\nx: 1\n---\n- [x] a",
    ],
  ])("%s", (_, input, index, expected) => {
    expect(toggleTask(input, index)).toBe(expected);
  });

  test.each([
    ["an HTML comment", "<!--\n- [ ] hint\n-->\n"],
    ["an HTML block", "<details>\n- [ ] hidden\n</details>\n\n"],
    ["an indented code block", "para\n\n    - [ ] code\n\n"],
    ["a fence holding a shorter fence", "````\n```\n- [ ] c\n```\n````\n"],
    ["a fence inside a blockquote", "> ```\n> - [ ] c\n> ```\n\n"],
    ["a math block", "$$\n- [ ] x\n$$\n\n"],
    ["an ordered list that can't interrupt a paragraph", "para\n2. [ ] x\n\n"],
    ["a checkbox written as HTML", '<input type="checkbox"> hi\n\n'],
    [
      "a checkbox with a look-alike class",
      '- foo <input class="x task-checkbox" type="checkbox">\n',
    ],
  ])("skips %s", (_, prefix) => {
    expect(toggleTask(`${prefix}- [ ] real`, 0)).toBe(`${prefix}- [x] real`);
  });

  test("counts boxes in the order they are rendered", () => {
    // Footnotes render at the end, after the list that follows them.
    const doc = "t[^1]\n\n[^1]: - [ ] note\n\n- [ ] real";
    expect(toggleTask(doc, 0)).toBe("t[^1]\n\n[^1]: - [ ] note\n\n- [x] real");
    expect(toggleTask(doc, 1)).toBe("t[^1]\n\n[^1]: - [x] note\n\n- [ ] real");
  });

  test("ignores a box inside an unclosed fence", () => {
    expect(toggleTask("- [ ] real\n```\n- [ ] c", 0)).toBe(
      "- [x] real\n```\n- [ ] c",
    );
  });

  test.each([
    ["an index past the last box", "- [ ] a", 1],
    ["an empty document", "", 0],
    ["a document without tasks", "- a\n- b", 0],
    ["a box with no text after it", "- [ ]", 0],
  ])("returns undefined for %s", (_, input, index) => {
    expect(toggleTask(input, index)).toBeUndefined();
  });
});
