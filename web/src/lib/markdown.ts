import dompurify from "dompurify";
import { Marked } from "marked";

const marked = new Marked({ gfm: true, breaks: false });

export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false });
  return dompurify.sanitize(html);
}
