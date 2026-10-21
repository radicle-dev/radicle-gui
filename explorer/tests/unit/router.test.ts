import { describe, expect, test } from "vitest";
import { testExports, type Route } from "@app/lib/router";
import config from "@tests/support/config.js";

// Defining the window.origin value, since vitest doesn't provide one.
window.origin = "http://localhost:3000";

describe("route invariant when parsed", () => {
  const origin = "http://localhost:3000";
  const node = {
    hostname: "example.node.tld",
    port: 8000,
    scheme: "http",
  };

  test("nodes", () => {
    expectParsingInvariant({
      resource: "nodes",
      params: {
        // TODO: This only works with the value 0. The value is not actually
        // extract.
        repoPageIndex: 0,
        baseUrl: node,
      },
    });
  });
  test("repos.tree", () => {
    expectParsingInvariant({
      resource: "repo.source",
      node,
      repo: "rad:zKtT7DmF9H34KkvcKj9PHW19WzjT",
      route: "",
    });
  });

  test("repos.tree with peer", () => {
    expectParsingInvariant({
      resource: "repo.source",
      node,
      repo: "REPO",
      peer: "PEER",
      route: "",
    });
  });

  test("repos.tree with peer and revision", () => {
    const route: Route = {
      resource: "repo.source",
      node,
      repo: "REPO",
      peer: "PEER",
      revision: "REVISION",
      route: "",
    };
    const path = testExports.routeToPath(route);
    route.revision = undefined;
    route.route = "REVISION";
    expect(testExports.urlToRoute(new URL(path, origin))).toEqual(route);
  });

  test("repos.tree with peer and revision and path", () => {
    const route: Route = {
      resource: "repo.source",
      node,
      repo: "REPO",
      peer: "PEER",
      path: "PATH",
      revision: "REVISION",
      route: "",
    };
    const path = testExports.routeToPath(route);
    route.revision = undefined;
    route.path = undefined;
    route.route = "REVISION/PATH";
    expect(testExports.urlToRoute(new URL(path, origin))).toEqual(route);
  });

  test("repos.history", () => {
    expectParsingInvariant({
      resource: "repo.history",
      node,
      repo: "REPO",
      revision: "",
    });
  });

  test("repos.history with revision", () => {
    expectParsingInvariant({
      resource: "repo.history",
      node,
      repo: "REPO",
      revision: "REVISION",
    });
  });

  test("repos.commits", () => {
    expectParsingInvariant({
      resource: "repo.commit",
      node,
      repo: "REPO",
      commit: "COMMIT",
    });
  });

  test("repos.issues", () => {
    expectParsingInvariant({
      resource: "repo.issues",
      node,
      repo: "REPO",
    });
  });

  test("repos.issues with status", () => {
    expectParsingInvariant({
      resource: "repo.issues",
      node,
      repo: "REPO",
      status: "closed",
    });
  });

  test("repos.issue", () => {
    expectParsingInvariant({
      resource: "repo.issue",
      node,
      repo: "REPO",
      issue: "ISSUE",
    });
  });

  test("repos.patches", () => {
    expectParsingInvariant({
      resource: "repo.patches",
      node,
      repo: "REPO",
      search: "SEARCH",
    });
  });

  test("repos.patches with search", () => {
    expectParsingInvariant({
      resource: "repo.patches",
      node,
      repo: "REPO",
      search: "SEARCH",
    });
  });

  test("repos.patch default view", () => {
    expectParsingInvariant({
      resource: "repo.patch",
      node,
      repo: "REPO",
      patch: "PATCH",
    });
  });

  test("repos.patch activity", () => {
    expectParsingInvariant({
      resource: "repo.patch",
      node,
      repo: "REPO",
      patch: "PATCH",
      view: { name: "activity" },
    });
  });

  test("repos.patch changes", () => {
    expectParsingInvariant({
      resource: "repo.patch",
      node,
      repo: "REPO",
      patch: "PATCH",
      view: { name: "changes" },
    });
  });

  test("repos.patch changes with revision", () => {
    expectParsingInvariant({
      resource: "repo.patch",
      node,
      repo: "REPO",
      patch: "PATCH",
      view: { name: "changes", revision: "REVISION" },
    });
  });

  test("repos.patch diff", () => {
    expectParsingInvariant({
      resource: "repo.patch",
      node,
      repo: "REPO",
      patch: "PATCH",
      view: {
        name: "diff",
        fromCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        toCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    });
  });

  function expectParsingInvariant(route: Route) {
    const path = testExports.routeToPath(route);
    expect(testExports.urlToRoute(new URL(path, origin))).toEqual(route);
  }
});

describe("pathToRoute", () => {
  test("non-existent", () => {
    expectPathToRoute("/foo/baz/bar", null);
  });

  test("nodes", () => {
    expectPathToRoute("/nodes/example.node.tld", {
      resource: "nodes",
      params: {
        baseUrl: {
          hostname: "example.node.tld",
          scheme: "http",
          port: config.nodes.defaultHttpdPort,
        },
        repoPageIndex: 0,
      },
    });
  });

  test("repo with trailing slash", () => {
    expectPathToRoute(
      "/nodes/example.node.tld/rad:zKtT7DmF9H34KkvcKj9PHW19WzjT/",
      {
        resource: "repo.source",
        node: {
          hostname: "example.node.tld",
          scheme: "http",
          port: config.nodes.defaultHttpdPort,
        },
        repo: "rad:zKtT7DmF9H34KkvcKj9PHW19WzjT",
        route: "",
      },
    );
  });

  test("repo without trailing slash", () => {
    expectPathToRoute(
      "/nodes/example.node.tld/rad:zKtT7DmF9H34KkvcKj9PHW19WzjT",
      {
        resource: "repo.source",
        node: {
          hostname: "example.node.tld",
          scheme: "http",
          port: config.nodes.defaultHttpdPort,
        },
        repo: "rad:zKtT7DmF9H34KkvcKj9PHW19WzjT",
        route: "",
      },
    );
  });

  test("non-existent repo route", () => {
    expectPathToRoute(
      "/nodes/example.node.tld/rad:zKtT7DmF9H34KkvcKj9PHW19WzjT/nope",
      null,
    );
  });

  function expectPathToRoute(relativeUrl: string, route: Route | null) {
    expect(
      testExports.urlToRoute(new URL(relativeUrl, "http://localhost/")),
    ).toEqual(route);
  }
});

describe("extractBaseUrl", () => {
  test("hostname with explicit port", () => {
    const result = testExports.extractBaseUrl("example.com:9000");
    expect(result).toEqual({
      hostname: "example.com",
      port: 9000,
      scheme: config.nodes.defaultHttpdScheme,
    });
  });

  test("hostname without port uses default port and scheme", () => {
    const result = testExports.extractBaseUrl("example.com");
    expect(result).toEqual({
      hostname: "example.com",
      port: config.nodes.defaultHttpdPort,
      scheme: config.nodes.defaultHttpdScheme,
    });
  });

  test("localhost without port uses local port and http scheme", () => {
    const result = testExports.extractBaseUrl("localhost");
    expect(result).toEqual({
      hostname: "localhost",
      port: config.nodes.defaultLocalHttpdPort,
      scheme: "http",
    });
  });

  test("localhost with explicit port uses http scheme", () => {
    const result = testExports.extractBaseUrl("localhost:3000");
    expect(result).toEqual({
      hostname: "localhost",
      port: 3000,
      scheme: "http",
    });
  });

  test("wildcard localhost domain without port uses local port and http scheme", () => {
    const result = testExports.extractBaseUrl("app.localhost");
    expect(result).toEqual({
      hostname: "app.localhost",
      port: config.nodes.defaultLocalHttpdPort,
      scheme: "http",
    });
  });

  test("127.0.0.1 without port uses local port and http scheme", () => {
    const result = testExports.extractBaseUrl("127.0.0.1");
    expect(result).toEqual({
      hostname: "127.0.0.1",
      port: config.nodes.defaultLocalHttpdPort,
      scheme: "http",
    });
  });

  test("127.0.0.1 with explicit port uses http scheme", () => {
    const result = testExports.extractBaseUrl("127.0.0.1:8080");
    expect(result).toEqual({
      hostname: "127.0.0.1",
      port: 8080,
      scheme: "http",
    });
  });

  test("onion domain without port uses default port and http scheme", () => {
    const result = testExports.extractBaseUrl("example.onion");
    expect(result).toEqual({
      hostname: "example.onion",
      port: config.nodes.defaultHttpdPort,
      scheme: "http",
    });
  });

  test("onion domain with explicit port uses http scheme", () => {
    const result = testExports.extractBaseUrl("example.onion:9050");
    expect(result).toEqual({
      hostname: "example.onion",
      port: 9050,
      scheme: "http",
    });
  });

  test("URL-encoded hostname is decoded", () => {
    const result = testExports.extractBaseUrl("example.com%3A8000");
    expect(result).toEqual({
      hostname: "example.com",
      port: 8000,
      scheme: config.nodes.defaultHttpdScheme,
    });
  });
});

// Cloudflare's single-page-application fallback percent-encodes the path on a
// fresh load or reload, so these paths are what the router actually receives
// in production for a URL the user sees and copies in its decoded form.
describe("percent-encoded path segments", () => {
  const node = {
    hostname: "example.node.tld",
    scheme: "http",
    port: config.nodes.defaultHttpdPort,
  };

  test("encoded repo id is decoded", () => {
    expectPathToRoute(
      "/nodes/example.node.tld/rad%3AzKtT7DmF9H34KkvcKj9PHW19WzjT/patches/68579c8c8c792d39522c31544ed696b6e3a607fb",
      {
        resource: "repo.patch",
        node,
        repo: "rad:zKtT7DmF9H34KkvcKj9PHW19WzjT",
        patch: "68579c8c8c792d39522c31544ed696b6e3a607fb",
      },
    );
  });

  test("decoded repo id is left as is", () => {
    expectPathToRoute(
      "/nodes/example.node.tld/rad:zKtT7DmF9H34KkvcKj9PHW19WzjT",
      {
        resource: "repo.source",
        node,
        repo: "rad:zKtT7DmF9H34KkvcKj9PHW19WzjT",
        route: "",
      },
    );
  });

  test("encoded did is decoded", () => {
    expectPathToRoute(
      "/nodes/example.node.tld/users/did%3Akey%3Az6MktaNvN1tVAno62rCfqvV8bBoTeAyHjuJz9YZjmpBmnCwd",
      {
        resource: "users",
        baseUrl: node,
        did: "did:key:z6MktaNvN1tVAno62rCfqvV8bBoTeAyHjuJz9YZjmpBmnCwd",
      },
    );
  });

  // Repo aliases are operator-supplied and unvalidated, so a segment that is
  // not a well-formed encoding must not throw out of route parsing.
  test("undecodable repo id is passed through", () => {
    expectPathToRoute("/nodes/example.node.tld/100%", {
      resource: "repo.source",
      node,
      repo: "100%",
      route: "",
    });
  });

  // Revision segments must stay encoded: branch and tag lookups are keyed on
  // the encoded name, and decoding `%2F` here would turn a tag like
  // `v1.0/release` into two path segments.
  test("encoded tag name in a tree route stays encoded", () => {
    expectPathToRoute(
      "/nodes/example.node.tld/rad%3AzKtT7DmF9H34KkvcKj9PHW19WzjT/tree/v1.0%2Frelease",
      {
        resource: "repo.source",
        node,
        repo: "rad:zKtT7DmF9H34KkvcKj9PHW19WzjT",
        route: "v1.0%2Frelease",
      },
    );
  });

  test("encoded tag name in a history route stays encoded", () => {
    expectPathToRoute(
      "/nodes/example.node.tld/rad%3AzKtT7DmF9H34KkvcKj9PHW19WzjT/history/v1.0%2Frelease",
      {
        resource: "repo.history",
        node,
        repo: "rad:zKtT7DmF9H34KkvcKj9PHW19WzjT",
        revision: "v1.0%2Frelease",
      },
    );
  });

  test("encoded tag name under an explicit peer stays encoded", () => {
    expectPathToRoute(
      "/nodes/example.node.tld/rad%3AzKtT7DmF9H34KkvcKj9PHW19WzjT/remotes/z6MktaNvN1tVAno62rCfqvV8bBoTeAyHjuJz9YZjmpBmnCwd/tree/v1.0%2Frelease",
      {
        resource: "repo.source",
        node,
        repo: "rad:zKtT7DmF9H34KkvcKj9PHW19WzjT",
        peer: "z6MktaNvN1tVAno62rCfqvV8bBoTeAyHjuJz9YZjmpBmnCwd",
        route: "v1.0%2Frelease",
      },
    );
  });

  // Decoding the repo id changes what `routeToPath` emits, which is what heals
  // the address bar and the "Copy link" button on subsequent navigation.
  test("an encoded path round-trips to its decoded form", () => {
    const route = testExports.urlToRoute(
      new URL(
        "/nodes/example.node.tld/rad%3AzKtT7DmF9H34KkvcKj9PHW19WzjT/tree/v1.0%2Frelease",
        "http://localhost/",
      ),
    );
    expect(testExports.routeToPath(route!)).toEqual(
      "/nodes/example.node.tld/rad:zKtT7DmF9H34KkvcKj9PHW19WzjT/tree/v1.0%2Frelease",
    );
  });

  function expectPathToRoute(relativeUrl: string, route: Route | null) {
    expect(
      testExports.urlToRoute(new URL(relativeUrl, "http://localhost/")),
    ).toEqual(route);
  }
});
