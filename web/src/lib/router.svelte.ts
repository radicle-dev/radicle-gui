// A small history router: every view has a real URL, and the browser's own
// back, forward and reload do the right thing.

export type Route =
  | { name: "home" }
  | { name: "welcome" }
  | { name: "inbox" }
  | { name: "explore"; q: string }
  | { name: "node" }
  | { name: "settings"; section: string }
  | { name: "newRepo" }
  | { name: "newOrg" }
  | { name: "person"; alias: string; tab: string }
  | { name: "org"; handle: string; tab: string }
  | { name: "repo"; owner: string; repo: string; view: RepoView }
  | { name: "notFound" };

export type RepoView =
  | { tab: "code"; path: string; peer?: string }
  | { tab: "commits" }
  | { tab: "commit"; sha: string }
  | { tab: "issues"; filter: string }
  | { tab: "newIssue" }
  | { tab: "issue"; id: string }
  | { tab: "patches"; filter: string }
  | { tab: "patch"; id: string; view: string }
  | { tab: "releases" }
  | { tab: "ryph" }
  | { tab: "identity" }
  | { tab: "settings" };

function parse(url: URL): Route {
  const parts = url.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const q = url.searchParams;
  const [a, b, c, d, ...rest] = parts;

  if (parts.length === 0) return { name: "home" };
  if (parts.length === 1) {
    switch (a) {
      case "welcome":
        return { name: "welcome" };
      case "inbox":
        return { name: "inbox" };
      case "explore":
        return { name: "explore", q: q.get("q") ?? "" };
      case "node":
        return { name: "node" };
      case "settings":
        return { name: "settings", section: q.get("section") ?? "profile" };
      case "new":
        return { name: "newRepo" };
    }
  }
  if (a === "orgs" && b === "new") return { name: "newOrg" };
  if (a.startsWith("@") && parts.length === 1) {
    return { name: "person", alias: a.slice(1), tab: q.get("tab") ?? "overview" };
  }
  if (parts.length === 1) {
    return { name: "org", handle: a, tab: q.get("tab") ?? "overview" };
  }

  const repo = (view: RepoView): Route => ({ name: "repo", owner: a, repo: b, view });
  const peer = q.get("peer") ?? undefined;
  if (c === undefined) return repo({ tab: "code", path: "", peer });
  switch (c) {
    case "tree":
      return repo({ tab: "code", path: [d, ...rest].filter(Boolean).join("/"), peer });
    case "commits":
      return repo({ tab: "commits" });
    case "commit":
      return d ? repo({ tab: "commit", sha: d }) : repo({ tab: "commits" });
    case "issues":
      if (d === "new") return repo({ tab: "newIssue" });
      return d
        ? repo({ tab: "issue", id: d })
        : repo({ tab: "issues", filter: q.get("state") ?? "open" });
    case "patches":
      return d
        ? repo({ tab: "patch", id: d, view: q.get("view") ?? "conversation" })
        : repo({ tab: "patches", filter: q.get("state") ?? "open" });
    case "releases":
      return repo({ tab: "releases" });
    case "ryph":
      return repo({ tab: "ryph" });
    case "identity":
      return repo({ tab: "identity" });
    case "settings":
      return repo({ tab: "settings" });
  }
  return { name: "notFound" };
}

class Router {
  route = $state<Route>({ name: "home" });
  path = $state("/");

  constructor() {
    if (typeof window === "undefined") return;
    this.#sync();
    window.addEventListener("popstate", () => this.#sync());
    document.addEventListener("click", e => this.#intercept(e));
  }

  #sync() {
    const url = new URL(window.location.href);
    this.path = url.pathname + url.search;
    this.route = parse(url);
  }

  navigate(href: string, opts: { replace?: boolean } = {}) {
    const url = new URL(href, window.location.origin);
    if (url.pathname + url.search === this.path && !opts.replace) return;
    if (opts.replace) window.history.replaceState({}, "", url);
    else window.history.pushState({}, "", url);
    this.#sync();
    if (!url.hash) window.scrollTo(0, 0);
  }

  #intercept(e: MouseEvent) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
    e.preventDefault();
    this.navigate(href);
  }
}

export const router = new Router();
export const navigate = (href: string, opts?: { replace?: boolean }) =>
  router.navigate(href, opts);
