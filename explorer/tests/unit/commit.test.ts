import { describe, expect, test } from "vitest";

import * as commit from "@app/lib/commit";

describe("renderCommitDescription", () => {
  test("escapes HTML in commit text", () => {
    expect(commit.renderCommitDescription("<script>alert(1)</script>")).toEqual(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  test("trims leading and trailing whitespace", () => {
    expect(commit.renderCommitDescription("  hello  ")).toEqual("hello");
  });

  test("converts a bare URL into a radicle-external-link", () => {
    expect(commit.renderCommitDescription("see https://example.com")).toEqual(
      'see <radicle-external-link href="https://example.com">https://example.com</radicle-external-link>',
    );
  });

  test("strips surrounding angle brackets (CommonMark autolink)", () => {
    const out = commit.renderCommitDescription(
      "see <https://github.com/radicle-dev/heartwood> for code",
    );
    expect(out).toContain('href="https://github.com/radicle-dev/heartwood"');
    expect(out).not.toMatch(/href="[^"]*&gt;/);
    // Autolink syntax should not produce visible angle brackets.
    expect(out).not.toContain("&lt;");
    expect(out).not.toContain("&gt;");
  });

  test("does not include trailing period in the link href", () => {
    const out = commit.renderCommitDescription("see https://example.com.");
    expect(out).toContain('href="https://example.com"');
    expect(out).not.toContain('href="https://example.com."');
    expect(out.endsWith(".")).toBe(true);
  });

  test("autolink followed by period: brackets stripped, period preserved", () => {
    const out = commit.renderCommitDescription(
      "See <https://doc.rust-lang.org/edition-guide/rust-2024/>.",
    );
    expect(out).toContain(
      'href="https://doc.rust-lang.org/edition-guide/rust-2024/"',
    );
    expect(out).not.toContain("&lt;");
    expect(out).not.toContain("&gt;");
    expect(out.endsWith(".")).toBe(true);
  });

  test("does not include enclosing parentheses in the link href", () => {
    const out = commit.renderCommitDescription("see (https://example.com)");
    expect(out).toContain('href="https://example.com"');
    expect(out).not.toContain('href="https://example.com)"');
  });

  test("preserves ampersands inside query strings", () => {
    const out = commit.renderCommitDescription("https://example.com/?a=1&b=2");
    expect(out).toContain('href="https://example.com/?a=1&amp;b=2"');
  });

  test("links multiple URLs in one description", () => {
    const out = commit.renderCommitDescription(
      "see https://a.example and https://b.example",
    );
    expect(out).toContain('href="https://a.example"');
    expect(out).toContain('href="https://b.example"');
  });

  test("leaves text without URLs untouched", () => {
    expect(commit.renderCommitDescription("just some plain text")).toEqual(
      "just some plain text",
    );
  });

  test("does not linkify text without a scheme (fuzzyLink off)", () => {
    const out = commit.renderCommitDescription("contact foo@example.com");
    expect(out).not.toContain("<radicle-external-link");
  });
});
