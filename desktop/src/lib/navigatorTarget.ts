import type { Route } from "@app/lib/router";

export type NavigatorTarget =
  | { kind: "route"; route: Route }
  | { kind: "user"; did: string; url: string | undefined };

const didPattern = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]+$/;
const ridPattern = /^rad:z[1-9A-HJ-NP-Za-km-z]+$/;
const oidPattern = /^[0-9a-f]{40}$/;

// Resolve pasted text to a route: an explorer link such as
// `https://radicle.network/nodes/<seed>/rad:z…/issues/<id>`, a `rad://z…`
// URI, a bare `rad:z…` repository ID, or a user's DID or explorer profile,
// which the app has no page for and so opens in the browser.
export function parseNavigatorTarget(
  input: string,
): NavigatorTarget | undefined {
  const text = input.trim();
  if (text === "") {
    return undefined;
  }

  let segments: string[];
  if (text.startsWith("rad://")) {
    segments = text.slice("rad://".length).split("/");
    segments[0] = `rad:${segments[0]}`;
  } else {
    let pathname = text;
    if (/^https?:\/\//.test(text)) {
      try {
        pathname = new URL(text).pathname;
      } catch {
        // A malformed link is searched as a plain path instead.
      }
    }
    segments = pathname.split("/").map(s => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  }

  const did = segments.find(s => didPattern.test(s));
  if (did) {
    return {
      kind: "user",
      did,
      url: /^https?:\/\//.test(text) ? text : undefined,
    };
  }

  const route = parseRoute(segments);
  return route && { kind: "route", route };
}

function parseRoute(segments: string[]): Route | undefined {
  const ridIndex = segments.findIndex(s => ridPattern.test(s));
  if (ridIndex === -1) {
    return undefined;
  }
  const rid = segments[ridIndex];
  const [resource, id] = segments.slice(ridIndex + 1).filter(s => s !== "");

  if (resource === "issues" && id && oidPattern.test(id)) {
    return { resource: "repo.issue", rid, issue: id, status: "all" };
  } else if (resource === "issues") {
    return { resource: "repo.issues", rid, status: "all" };
  } else if (resource === "patches" && id && oidPattern.test(id)) {
    return {
      resource: "repo.patch",
      rid,
      patch: id,
      status: undefined,
      reviewId: undefined,
    };
  } else if (resource === "patches") {
    return { resource: "repo.patches", rid, status: undefined };
  } else if (resource === "commits" && id && oidPattern.test(id)) {
    return { resource: "repo.commit", rid, commit: id };
  } else if (resource === "commits") {
    return { resource: "repo.commits", rid };
  } else {
    return { resource: "repo.home", rid };
  }
}
