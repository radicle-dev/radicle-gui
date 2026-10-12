/// Inline markdown, dropped down to the words it decorates. A row is a couple
/// of truncated lines, and on a narrow column the punctuation crowds out the
/// text that says what the comment is about. Deliberately shallow — this is a
/// preview, not a parser; the comment itself is one click away in the diff.
export function plainText(body: string): string {
  return (
    body
      .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
      .replace(/`/gu, "")
      .replace(/~~(.+?)~~/gu, "$1")
      // Emphasis only where a marker sits on a word boundary, so `snake_case`,
      // `MAX_SIZE` and `_private` survive being read as italics, and with no
      // space just inside it, so `2 * 3 * 4` does too.
      .replace(
        /(^|[^\w])[*_]{1,2}(?=\S)([^*_]+?)(?<=\S)[*_]{1,2}(?=[^\w]|$)/gu,
        "$1$2",
      )
      .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
      .replace(/^\s{0,3}>\s?/gmu, "")
      .replace(/^\s{0,3}(?:[-+*]|\d+\.)\s+/gmu, "")
      .replace(/\s+/gu, " ")
      .trim()
  );
}
