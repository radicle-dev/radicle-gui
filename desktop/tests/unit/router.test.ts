import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Route } from "@app/lib/router";
import {
  activeUnloadedRouteStore,
  loadFromLocation,
  push,
  routeToPath,
} from "@app/lib/router";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@app/lib/invoke", () => ({ invoke }));
vi.mock("@app/lib/router/definitions", () => ({
  loadRoute: async (route: Route) => route,
}));

const rid = "rad:z3fpY7nttPPa6MBnAv2DccHzQJnqe";
const sha = "a".repeat(40);

async function resolve(path: string) {
  window.history.pushState(null, "", path);
  await loadFromLocation();
  return get(activeUnloadedRouteStore);
}

beforeEach(() => {
  vi.stubGlobal("origin", window.location.origin);
  vi.spyOn(console, "error").mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("routeToPath and loadFromLocation round trip", () => {
  test.each<[string, Route]>([
    ["/inbox", { resource: "inbox" }],
    ["/guide", { resource: "guide" }],
    [`/repos/${rid}/home`, { resource: "repo.home", rid }],
    [
      `/repos/${rid}/commits/main`,
      { resource: "repo.commits", rid, revision: "main" },
    ],
    [
      `/repos/${rid}/commits/${sha}`,
      { resource: "repo.commit", rid, commit: sha },
    ],
    [`/repos/${rid}/identity`, { resource: "repo.identity", rid }],
    [
      `/repos/${rid}/issues?status=closed`,
      { resource: "repo.issues", rid, status: "closed" },
    ],
    [
      `/repos/${rid}/issues/abc?status=open`,
      { resource: "repo.issue", rid, issue: "abc", status: "open" },
    ],
    [
      `/repos/${rid}/patches?status=merged`,
      { resource: "repo.patches", rid, status: "merged" },
    ],
    [
      `/repos/${rid}/patches/abc?status=draft`,
      {
        resource: "repo.patch",
        rid,
        patch: "abc",
        status: "draft",
        reviewId: undefined,
      },
    ],
  ])("%s", async (path, route) => {
    expect(routeToPath(route)).toBe(path);
    expect(await resolve(path)).toEqual(route);
    expect(console.error).not.toHaveBeenCalled();
  });
});

test("booting has no path", () => {
  expect(routeToPath({ resource: "booting" })).toBe("");
});

test("resolves the root to the inbox", async () => {
  await resolve("/guide");

  expect(await resolve("/")).toEqual({ resource: "inbox" });
  expect(console.error).not.toHaveBeenCalled();
});

test.each([
  "/bogus",
  "/inbox/extra",
  "/guide/extra",
  "/repos/",
  `/repos/${rid}/bogus`,
])("falls back to the inbox for %s", async path => {
  await resolve("/guide");

  expect(await resolve(path)).toEqual({ resource: "inbox" });
  expect(console.error).toHaveBeenCalledWith(
    expect.stringContaining("Could not resolve route"),
  );
});

describe("clicks on app links", () => {
  function clickLink(href: string, handle?: (event: Event) => void) {
    const anchor = document.createElement("a");
    anchor.setAttribute("href", href);
    if (handle) {
      anchor.addEventListener("click", handle);
    }
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  test("navigate to the route", async () => {
    await resolve("/guide");

    clickLink("/inbox");
    await vi.waitFor(() =>
      expect(get(activeUnloadedRouteStore)).toEqual({ resource: "inbox" }),
    );
  });

  test("leave links that handled their own click alone", async () => {
    await resolve("/guide");

    clickLink("/inbox", event => event.preventDefault());
    expect(get(activeUnloadedRouteStore)).toEqual({ resource: "guide" });
    expect(window.location.pathname).toBe("/guide");
  });
});

test("push a route with a fragment to scroll to", async () => {
  await resolve("/guide");

  await push({ resource: "repo.home", rid, path: "docs/guide.md" }, "café");
  expect(get(activeUnloadedRouteStore)).toEqual({
    resource: "repo.home",
    rid,
    path: "docs/guide.md",
  });
  expect(decodeURIComponent(window.location.hash)).toBe("#café");

  await push({ resource: "guide" });
  expect(window.location.hash).toBe("");
});
