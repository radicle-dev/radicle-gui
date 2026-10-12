import { expect, test } from "vitest";

import { parseFrontmatter } from "@app/lib/frontmatter";

test.each([
  ["LF", "---\ntitle: Hello\nn: 1\n---\n# Body\n"],
  ["CRLF", "---\r\ntitle: Hello\r\nn: 1\r\n---\r\n# Body\n"],
])("splits %s frontmatter from the content", (_, input) => {
  expect(parseFrontmatter(input)).toEqual({
    data: { title: "Hello", n: 1 },
    content: "# Body\n",
  });
});

test("accepts a closing fence at the end of the input", () => {
  expect(parseFrontmatter("---\na: 1\n---")).toEqual({
    data: { a: 1 },
    content: "",
  });
});

test("stops at the first closing fence", () => {
  expect(parseFrontmatter("---\na: 1\n---\ntext\n---\nmore")).toEqual({
    data: { a: 1 },
    content: "text\n---\nmore",
  });
});

test.each([
  "# Title\n---\na: 1\n---\n",
  " ---\na: 1\n---\n",
  "---\na: 1\n",
  "---\n---\n",
])("leaves %j without frontmatter as is", input => {
  expect(parseFrontmatter(input)).toEqual({ data: {}, content: input });
});

test.each([
  ["a scalar", "just text"],
  ["a list", "- a\n- b"],
  ["null", "~"],
  ["nothing", ""],
  ["a comment", "# draft"],
  ["invalid YAML", "Note: see: below"],
])("drops a block holding %s but strips it", (_, yaml) => {
  expect(parseFrontmatter(`---\n${yaml}\n---\nbody`)).toEqual({
    data: {},
    content: "body",
  });
});
