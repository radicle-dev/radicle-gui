import { show } from "@app/lib/modal";
import { decodeComponent, resolveRepoTarget } from "@app/lib/repoImages";

import UnopenableLink from "@app/modals/UnopenableLink.svelte";

export type DocumentLink =
  | { type: "fragment"; id: string }
  // A path in the repository, undefined for its root.
  | { type: "file"; path: string | undefined; fragment?: string }
  | { type: "external" }
  | { type: "unsupported" };

export type OpenFile = (
  path: string | undefined,
  fragment: string | undefined,
) => void;

// The schemes the shell plugin hands to the operating system when an anchor
// with `target="_blank"` is clicked.
const externalScheme = /^(?:https?|mailto|tel):/i;
const scheme = /^[a-z][a-z\d+.-]*:/i;

/**
 * Classify a link in the document at `from`. Links without a scheme are
 * paths in the repository, as they are on code forges, so they never point
 * at a page of the app.
 */
export function classifyDocumentLink(href: string, from: string): DocumentLink {
  if (href === "" || href.startsWith("#")) {
    return { type: "fragment", id: decodeComponent(href.slice(1)) };
  }

  if (scheme.test(href)) {
    return externalScheme.test(href)
      ? { type: "external" }
      : { type: "unsupported" };
  }

  const target = resolveRepoTarget(href, from);
  if (!target) {
    return { type: "unsupported" };
  }

  const path = target.path.replace(/\/+$/, "");
  if (path === from && target.fragment !== undefined) {
    return { type: "fragment", id: target.fragment };
  }

  return { type: "file", path: path || undefined, fragment: target.fragment };
}

// Markdown headings get lowercase ids, so a link written with the heading's
// own casing falls back to the lowercase id.
export function scrollToFragment(id: string) {
  const target =
    document.getElementById(id) ??
    document.getElementsByName(id)[0] ??
    document.getElementById(id.toLowerCase());
  target?.scrollIntoView();
}

// Scrolls once per location, so that re-rendering a document doesn't scroll
// it back.
export function scrollToLocationFragment(
  scrolledAt: string | undefined,
): string {
  const { href, hash } = window.location;
  if (hash && href !== scrolledAt) {
    scrollToFragment(decodeComponent(hash.slice(1)));
  }
  return href;
}

export interface DocumentLinkOptions {
  path: string;
  openFile?: OpenFile;
}

/**
 * Make a link in a rendered document work inside the app. Following any link
 * that isn't external would otherwise load another page into the window and
 * restart the app. The document's options are read when the link is
 * followed, as the same markup can be shown for another file.
 */
export function enhanceDocumentLink(
  anchor: HTMLAnchorElement,
  options: () => DocumentLinkOptions,
) {
  const href = anchor.getAttribute("href");
  if (href === null) {
    return;
  }

  if (classifyDocumentLink(href, "").type === "external") {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    return;
  }

  anchor.onclick = event => {
    event.preventDefault();
    const { path, openFile } = options();
    const link = classifyDocumentLink(href, path);
    if (link.type === "fragment") {
      scrollToFragment(link.id);
    } else if (link.type === "file" && openFile) {
      openFile(link.path, link.fragment);
    } else {
      show({
        component: UnopenableLink,
        props: { link: href, reason: "unsupported" },
      });
    }
  };
}
