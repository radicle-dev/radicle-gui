import { load } from "js-yaml";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  content: string;
}

export function parseFrontmatter(input: string): ParsedFrontmatter {
  const match = input.match(FRONTMATTER_RE);
  if (!match) {
    return { data: {}, content: input };
  }
  const parsed = load(match[1]);
  const data =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { data, content: input.slice(match[0].length) };
}
