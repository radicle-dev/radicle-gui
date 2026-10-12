import type { Config } from "dompurify";
import type {
  MarkedExtension,
  RendererExtension,
  TokenizerExtension,
  Tokens,
} from "marked";

import dompurify from "dompurify";
import escape from "lodash/escape.js";
import { Marked, Renderer as BaseRenderer } from "marked";
import { markedEmoji } from "marked-emoji";
import markedFootnote from "marked-footnote";
import katexMarkedExtension from "marked-katex-extension";
import markedLinkifyIt from "marked-linkify-it";

import emojis from "@app/lib/emojis";
import { parseFrontmatter } from "@app/lib/frontmatter";
import { bareReferenceStart, matchBareReference } from "@app/lib/mentions";

// DOMPurify only keeps hrefs whose scheme it recognises, and drops `rad:` and
// `did:key:` links along with the rest. Neither can execute the way
// `javascript:` can, and the app replaces every such anchor with a component
// after sanitization, so none is ever followed as a raw href.
// This is DOMPurify's own default as of 3.4, with those two schemes added, so
// it needs revisiting when DOMPurify changes its default.
const allowedUriSchemes =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|rad|did):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i;

/**
 * DOMPurify configuration for sanitizing markdown-derived HTML. Pass this as
 * the second argument to `dompurify.sanitize` at each call site instead of
 * setting it globally. A global config leaks into every other consumer of the
 * DOMPurify singleton, including mermaid's internal strict-mode sanitization,
 * which would then strip the SVG output of valid diagrams.
 */
export const sanitizeConfig: Config = {
  /* eslint-disable @typescript-eslint/naming-convention */
  ALLOWED_URI_REGEXP: allowedUriSchemes,
  ALLOWED_ATTR: [
    "align",
    "alt",
    "checked",
    "class",
    "href",
    "id",
    "name",
    "rel",
    "target",
    "text",
    "title",
    "src",
    "type",
  ],
  ALLOWED_TAGS: [
    "a",
    "blockquote",
    "br",
    "code",
    "dd",
    "del",
    "div",
    "dl",
    "dt",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img",
    "input",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
  /* eslint-enable @typescript-eslint/naming-convention */
};

// Converts self closing anchor tags into empty anchor tags, to avoid erratic wrapping behaviour
// e.g. <a name="test"/> -> <a name="test"></a>
const anchorMarkedExtension = {
  name: "sanitizedAnchor",
  level: "block",
  start: (src: string) => src.match(/<a name="([\w]+)"\/>/)?.index,
  tokenizer(src: string) {
    const match = src.match(/^<a name="([\w]+)"\/>/);
    if (match) {
      return {
        type: "sanitizedAnchor",
        raw: match[0],
        text: match[1].trim(),
      };
    }
  },
  renderer: (token: Tokens.Generic): string => `<a name="${token.text}"></a>`,
};

// GitHub flavoured alerts: a blockquote whose first line is a `[!NOTE]` marker
// renders as a titled callout rather than a quote.
export const alertVariants = [
  "note",
  "tip",
  "important",
  "warning",
  "caution",
] as const;

export type AlertVariant = (typeof alertVariants)[number];

function isAlertVariant(name: string): name is AlertVariant {
  return (alertVariants as readonly string[]).includes(name);
}

const alertMarkedExtension: TokenizerExtension & RendererExtension = {
  name: "alert",
  level: "block",
  start: (src: string) => src.match(/^ {0,3}> *\[!/m)?.index,
  tokenizer(src: string) {
    const quote = /^(?: {0,3}>[^\n]*(?:\n|$))+/.exec(src);
    if (!quote) {
      return;
    }

    const body = quote[0].replace(/^ {0,3}> ?/gm, "");
    const marker = /^\[!([a-zA-Z]+)\][^\S\n]*(?:\n|$)/.exec(body);
    if (!marker) {
      return;
    }

    const variant = marker[1].toLowerCase();
    if (!isAlertVariant(variant)) {
      return;
    }

    return {
      type: "alert",
      raw: quote[0],
      variant,
      tokens: this.lexer.blockTokens(body.slice(marker[0].length)),
    };
  },
  renderer(token: Tokens.Generic): string {
    const variant = token.variant as AlertVariant;
    const title = variant.charAt(0).toUpperCase() + variant.slice(1);

    return `<div class="alert alert-${variant}"><p class="alert-title">${title}</p>${this.parser.parse(token.tokens ?? [])}</div>`;
  },
};

// Past this many references in one document the rest stay text, matching
// the number of chips `Markdown` mounts.
export const maximumReferences = 200;
const referenceCounts = new WeakMap<object, number>();

const radicleReferenceMarkedExtension: TokenizerExtension & RendererExtension =
  {
    name: "radicleReference",
    level: "inline",
    start(src: string) {
      if ((referenceCounts.get(this.lexer) ?? 0) >= maximumReferences) return;
      return bareReferenceStart(src);
    },
    tokenizer(src: string) {
      if (this.lexer.state.inLink) return;
      const match = matchBareReference(src);
      if (!match) return;
      referenceCounts.set(
        this.lexer,
        (referenceCounts.get(this.lexer) ?? 0) + 1,
      );

      return {
        type: "radicleReference",
        raw: match.raw,
        text: match.raw,
      };
    },
    renderer: (token: Tokens.Generic): string =>
      `<a href="${escape(token.text)}">${escape(token.text)}</a>`,
  };

const TASK_CHECKBOX_CLASS = "task-checkbox";

export class Renderer extends BaseRenderer {
  /**
   * If `baseUrl` is provided, all hrefs attributes in anchor tags, except those
   * starting with `#`, are resolved with respect to `baseUrl`
   */
  constructor() {
    super();
  }
  // Overwrites the rendering of heading tokens.
  // Since there are possible non ASCII characters in headings,
  // we escape them by replacing them with dashes and,
  // trim eventual dashes on each side of the string.
  heading({ tokens, depth }: Tokens.Heading) {
    const text = this.parser.parseInline(tokens);
    const id = text
      // By lowercasing we avoid casing mismatches, between headings and links.
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "");

    return `<h${depth} id="${id}">${text}</h${depth}>`;
  }

  checkbox({ checked }: Tokens.Checkbox): string {
    return `<input class="${TASK_CHECKBOX_CLASS}" ${checked ? 'checked="" ' : ""}disabled="" type="checkbox"> `;
  }

  link({ href, title, tokens }: Tokens.Link): string {
    const text = this.parser.parseInline(tokens);
    const attrs = [`href="${escape(href)}"`];
    if (title) {
      attrs.push(`title="${escape(title)}"`);
    }

    return `<a ${attrs.join(" ")}>${text}</a>`;
  }
}

export default new Marked();

export const markdownWithExtensions = new Marked(
  katexMarkedExtension({ throwOnError: false }),
  markedLinkifyIt({ fuzzyLink: false }),
  markedFootnote({ refMarkers: true }),
  markedEmoji({ emojis }),
  ((): MarkedExtension => ({
    extensions: [
      anchorMarkedExtension,
      alertMarkedExtension,
      radicleReferenceMarkedExtension,
    ],
  }))(),
);

export function renderMarkdown(content: string, breaks = false): string {
  return dompurify.sanitize(
    markdownWithExtensions.parse(content, {
      renderer: new Renderer(),
      breaks,
    }) as string,
    sanitizeConfig,
  );
}

const TASK_CANDIDATE_RE = /(?:[-*+]|\d{1,9}[.)])[ \t]+\[([ xX])\]/g;
const CODE_FENCE_RE = /^[ \t]*(`{3,}|~{3,})/;

export function isTaskCheckbox(element: Element): boolean {
  return element.getAttribute("class") === TASK_CHECKBOX_CLASS;
}

function taskStates(content: string): boolean[] {
  // A template's content is inert, so nothing in it loads or runs.
  const template = document.createElement("template");
  template.innerHTML = renderMarkdown(content);
  return Array.from(template.content.querySelectorAll('input[type="checkbox"]'))
    .filter(isTaskCheckbox)
    .map(input => input.hasAttribute("checked"));
}

function fencedRanges(content: string): [number, number][] {
  const ranges: [number, number][] = [];
  let open: { fence: string; start: number } | undefined;
  let offset = 0;
  for (const line of content.split("\n")) {
    const fence = CODE_FENCE_RE.exec(line)?.[1];
    if (fence && open === undefined) {
      open = { fence, start: offset };
    } else if (
      fence &&
      open &&
      fence[0] === open.fence[0] &&
      fence.length >= open.fence.length
    ) {
      ranges.push([open.start, offset + line.length]);
      open = undefined;
    }
    offset += line.length + 1;
  }
  if (open) {
    ranges.push([open.start, content.length]);
  }
  return ranges;
}

/// Flips the task-list box at `index`, counted in rendered order.
export function toggleTask(input: string, index: number): string | undefined {
  // Frontmatter is not rendered, so it is left out of the search.
  const { content } = parseFrontmatter(input);
  const prefix = input.slice(0, input.length - content.length);
  const states = taskStates(content);
  if (index >= states.length) {
    return undefined;
  }

  const positions = Array.from(
    content.matchAll(TASK_CANDIDATE_RE),
    match => match.index + match[0].length - 2,
  );
  const fenced = fencedRanges(content);
  const inCode = (p: number) =>
    fenced.some(([start, end]) => p >= start && p <= end);
  const outside = positions.filter(p => !inCode(p));
  const likely = outside[index];
  const ordered = [
    ...(likely === undefined ? [] : [likely]),
    ...outside.filter(p => p !== likely),
    ...positions.filter(inCode),
  ];

  for (const position of ordered) {
    const next =
      content.slice(0, position) +
      (content[position] === " " ? "x" : " ") +
      content.slice(position + 1);
    const nextStates = taskStates(next);
    if (
      nextStates.length === states.length &&
      nextStates.every((checked, i) =>
        i === index ? checked !== states[i] : checked === states[i],
      )
    ) {
      return prefix + next;
    }
  }

  return undefined;
}
