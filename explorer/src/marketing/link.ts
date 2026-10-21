import { navigateToUrl, useDefaultNavigation } from "@app/lib/router";

// Resolve the URL an anchor click should client-navigate to, or `undefined`
// when the browser should handle it natively: modified clicks, new-tab or
// download links, cross-origin links, and in-page fragment links (which scroll
// natively).
function clientNavigationTarget(
  event: MouseEvent,
  anchor: HTMLAnchorElement,
): URL | undefined {
  if (useDefaultNavigation(event)) {
    return undefined;
  }
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) {
    return undefined;
  }
  if (
    (anchor.target && anchor.target !== "_self") ||
    anchor.hasAttribute("download")
  ) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return undefined;
  }
  if (
    url.origin !== window.location.origin ||
    (url.pathname === window.location.pathname &&
      url.search === window.location.search)
  ) {
    return undefined;
  }
  return url;
}

// Svelte action: route an internal `<a>`'s clicks through the client-side
// router so they navigate in place and run the page transition, instead of
// triggering a full document load. Applied directly to marketing anchors, it
// keeps them in their component's style scope. External, new-tab, download and
// in-page links keep their native behaviour.
export function link(node: HTMLAnchorElement) {
  function onClick(event: MouseEvent) {
    const url = clientNavigationTarget(event, node);
    if (!url) {
      return;
    }
    event.preventDefault();
    void navigateToUrl("push", url);
  }

  node.addEventListener("click", onClick);
  return {
    destroy() {
      node.removeEventListener("click", onClick);
    },
  };
}

// Delegated variant for containers of rendered HTML (compiled markdown), where
// individual anchors can't carry a `use:` directive.
export function handleDelegatedLinkClick(event: MouseEvent) {
  const anchor = (event.target as HTMLElement | null)?.closest("a");
  if (!anchor) {
    return;
  }
  const url = clientNavigationTarget(event, anchor);
  if (!url) {
    return;
  }
  event.preventDefault();
  void navigateToUrl("push", url);
}
