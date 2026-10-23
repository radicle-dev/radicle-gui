// A small history router: every view has a real URL, and the browser's own
// back, forward and reload do the right thing.

export type Route =
  | { name: "home" }
  | { name: "welcome" }
  | { name: "inbox"; filter?: string }
  | { name: "explore"; q: string; seed?: string }
  | { name: "node" }
  | { name: "settings"; section: string }
  | { name: "newRepo"; owner?: string }
  | { name: "newOrg" }
  | { name: "person"; alias: string; tab: string; day?: string }
  | { name: "org"; handle: string; tab: string }
  | { name: "repo"; owner: string; repo: string; view: RepoView }
  | { name: "notFound" };

export type RepoView =
  | { tab: "code"; path: string; peer?: string }
  | { tab: "commits" }
  | { tab: "commit"; sha: string }
  | { tab: "issues"; filter: string; peek?: string }
  | { tab: "newIssue" }
  | { tab: "issue"; id: string }
  | { tab: "patches"; filter: string; peek?: string }
  | { tab: "patch"; id: string; view: string; rev?: number }
  | { tab: "board"; issue?: string; patch?: string }
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
        return { name: "inbox", filter: q.get("filter") ?? undefined };
      case "explore":
        return { name: "explore", q: q.get("q") ?? "", seed: q.get("seed") ?? undefined };
      case "node":
        return { name: "node" };
      case "settings":
        return { name: "settings", section: q.get("section") ?? "profile" };
      case "new":
        return { name: "newRepo", owner: q.get("owner") ?? undefined };
    }
  }
  if (a === "orgs" && b === "new") return { name: "newOrg" };
  if (a.startsWith("@") && parts.length === 1) {
    return { name: "person", alias: a.slice(1), tab: q.get("tab") ?? "overview", day: q.get("day") ?? undefined };
  }
  if (parts.length === 1) {
    return { name: "org", handle: a, tab: q.get("tab") ?? "overview" };
  }

  const repo = (view: RepoView): Route => ({ name: "repo", owner: a, repo: b, view });
  const peer = q.get("peer") ?? undefined;
  const peek = q.get("peek") ?? undefined;
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
        : repo({ tab: "issues", filter: q.get("state") ?? "open", peek });
    case "patches":
      return d
        ? repo({
            tab: "patch",
            id: d,
            view: q.get("view") ?? "conversation",
            rev: Number(q.get("rev")) || undefined,
          })
        : repo({ tab: "patches", filter: q.get("state") ?? "open", peek });
    case "board":
      return repo({ tab: "board", issue: q.get("issue") ?? undefined, patch: q.get("patch") ?? undefined });
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
  hash = $state("");
  // Counts navigations, so the same link followed twice still reacts.
  visits = $state(0);

  constructor() {
    if (typeof window === "undefined") return;
    this.#sync();
    window.addEventListener("popstate", () => this.#sync());
    document.addEventListener("click", e => this.#intercept(e));
  }

  #sync() {
    const url = new URL(window.location.href);
    this.path = url.pathname + url.search;
    this.hash = url.hash;
    this.route = parse(url);
  }

  navigate(href: string, opts: { replace?: boolean; scroll?: boolean } = {}) {
    const url = new URL(href, window.location.origin);
    const same = url.pathname + url.search === this.path && url.hash === this.hash;
    if (same && !opts.replace && !url.hash) return;
    if (opts.replace || same) window.history.replaceState({}, "", url);
    else window.history.pushState({}, "", url);
    this.#sync();
    this.visits++;
    if (!url.hash && opts.scroll !== false) window.scrollTo(0, 0);
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
export const navigate = (href: string, opts?: { replace?: boolean; scroll?: boolean }) =>
  router.navigate(href, opts);
