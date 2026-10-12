import { safeHttpUrl } from "@app/lib/utils";

export type MarkdownFormat = "bold" | "italic" | "code" | "link";

export interface TextEdit {
  from: number;
  to: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

const markers: Record<"bold" | "italic" | "code", string> = {
  bold: "**",
  italic: "_",
  code: "`",
};

const fence = "```";

function linkUrl(text: string): string | undefined {
  const candidate = text.trim();
  if (candidate === "" || /\s/.test(candidate)) {
    return undefined;
  }
  return safeHttpUrl(candidate) ? candidate : undefined;
}

export function applyTextEdit(value: string, edit: TextEdit): string {
  return value
    .substring(0, edit.from)
    .concat(edit.text, value.substring(edit.to));
}

function toggleWrap(
  value: string,
  start: number,
  end: number,
  marker: string,
): TextEdit {
  const width = marker.length;
  const selected = value.substring(start, end);

  if (
    selected.length >= width * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.substring(width, selected.length - width);
    return {
      from: start,
      to: end,
      text: inner,
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  if (
    start >= width &&
    value.substring(start - width, start) === marker &&
    value.substring(end, end + width) === marker
  ) {
    return {
      from: start - width,
      to: end + width,
      text: selected,
      selectionStart: start - width,
      selectionEnd: end - width,
    };
  }

  return {
    from: start,
    to: end,
    text: marker.concat(selected, marker),
    selectionStart: start + width,
    selectionEnd: end + width,
  };
}

function toggleCode(value: string, start: number, end: number): TextEdit {
  const selected = value.substring(start, end);
  if (!selected.includes("\n")) {
    return toggleWrap(value, start, end, markers.code);
  }

  const opening = `${fence}\n`;
  const closing = `\n${fence}`;

  if (selected.startsWith(opening) && selected.endsWith(closing)) {
    const inner = selected.substring(
      opening.length,
      selected.length - closing.length,
    );
    return {
      from: start,
      to: end,
      text: inner,
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  if (
    start >= opening.length &&
    value.substring(start - opening.length, start) === opening &&
    value.substring(end, end + closing.length) === closing
  ) {
    return {
      from: start - opening.length,
      to: end + closing.length,
      text: selected,
      selectionStart: start - opening.length,
      selectionEnd: end - opening.length,
    };
  }

  // Fences must start on their own line.
  const before = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
  const after = end < value.length && value[end] !== "\n" ? "\n" : "";
  const selectionStart = start + before.length + opening.length;

  return {
    from: start,
    to: end,
    text: before.concat(opening, selected, closing, after),
    selectionStart,
    selectionEnd: selectionStart + selected.length,
  };
}

function insertLink(value: string, start: number, end: number): TextEdit {
  const selected = value.substring(start, end);
  const url = linkUrl(selected);
  const text = url ? `[](${url})` : `[${selected}]()`;
  const caret = url ? start + 1 : start + text.length - 1;

  return {
    from: start,
    to: end,
    text,
    selectionStart: caret,
    selectionEnd: caret,
  };
}

export function applyMarkdownFormat(
  format: MarkdownFormat,
  value: string,
  start: number,
  end: number,
): TextEdit {
  switch (format) {
    case "bold":
      return toggleWrap(value, start, end, markers.bold);
    case "italic":
      return toggleWrap(value, start, end, markers.italic);
    case "code":
      return toggleCode(value, start, end);
    case "link":
      return insertLink(value, start, end);
  }
}

export function pasteLinkEdit(
  value: string,
  start: number,
  end: number,
  pasted: string,
): TextEdit | undefined {
  const url = linkUrl(pasted);
  if (start === end || !url) {
    return undefined;
  }

  const text = `[${value.substring(start, end)}](${url})`;
  const caret = start + text.length;

  return {
    from: start,
    to: end,
    text,
    selectionStart: caret,
    selectionEnd: caret,
  };
}
