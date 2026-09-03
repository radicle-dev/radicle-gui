import type { Repo } from "@http-client";

import { describe, expect, test } from "vitest";
import * as utils from "@app/lib/utils";

describe("Format functions", () => {
  test.each([
    {
      id: "rad:zKtT7DmF9H34KkvcKj9PHW19WzjT",
      expected: "rad:zKtT7D…19WzjT",
    },
  ])("formatRepositoryId $id => $expected", ({ id, expected }) => {
    expect(utils.formatRepositoryId(id)).toEqual(expected);
  });

  test.each([
    {
      input: "<TR> Hello `new` world",
      expected: "<TR> Hello <code>new</code> world",
    },
    { input: "Hello `new` world", expected: "Hello <code>new</code> world" },
    {
      input: "Hello `new` world `radicle`",
      expected: "Hello <code>new</code> world <code>radicle</code>",
    },
    { input: "Hello `` world", expected: "Hello `` world" },
    { input: "Hello `", expected: "Hello `" },
    { input: "Hello", expected: "Hello" },
  ])("formatInlineTitle $input => $expected", ({ input, expected }) => {
    expect(utils.formatInlineTitle(input)).toEqual(expected);
  });

  test.each([
    {
      id: "did:key:z6MkmzRwg47UWQxczLLLFfkEwpBGitjzJ1vKPE8U9ymd6fz6",
      expected: "did:key:z6Mkmz…md6fz6",
    },
    {
      id: "z6MkmzRwg47UWQxczLLLFfkEwpBGitjzJ1vKPE8U9ymd6fz6",
      expected: "did:key:z6Mkmz…md6fz6",
    },
  ])("formatNodeId $id => $expected", ({ id, expected }) => {
    expect(utils.formatNodeId(id)).toEqual(expected);
  });

  test.each([
    {
      id: "rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5",
      expected: "rad:z4V1sj…p4DtH5",
    },
    {
      id: "z4V1sjrXqjvFdnCUbxPFqd5p4DtH5",
      expected: "rad:z4V1sj…p4DtH5",
    },
  ])("formatRepositoryId $id => $expected", ({ id, expected }) => {
    expect(utils.formatRepositoryId(id)).toEqual(expected);
  });

  test.each([
    { commit: "a8a6a979a6261a2ec1ea85fc9a65a4a30aa22cc8", expected: "a8a6a97" },
    { commit: "a8a6a97", expected: "a8a6a97" },
  ])("formatCommit $commit => $expected", ({ commit, expected }) => {
    expect(utils.formatCommit(commit)).toEqual(expected);
  });
});

describe("String Assertions", () => {
  test.each([
    { path: "README.md", expected: true },
    { path: "README.mkd", expected: true },
    { path: "README.markdown", expected: true },
    { path: "", expected: false },
  ])("isMarkdownPath $path => $expected", ({ path, expected }) => {
    expect(utils.isMarkdownPath(path)).toEqual(expected);
  });

  test.each([
    { url: "https://radicle.network", expected: true },
    { url: "http://radicle.network", expected: true },
    { url: "http://app", expected: true },
    { url: "://app", expected: false },
    { url: "//app", expected: false },
    { url: "app", expected: false },
  ])("isUrl $url => $expected", ({ url, expected }) => {
    expect(utils.isUrl(url)).toBe(expected);
  });

  test.each([
    {
      url: "https://github.com/radicle-dev/radicle-explorer/blob/master/img.png",
      expected:
        "https://github.com/radicle-dev/radicle-explorer/blob/master/img.png?raw=true",
    },
    {
      // Already has ?raw=true, leave it untouched.
      url: "https://github.com/radicle-dev/radicle-explorer/blob/master/img.png?raw=true",
      expected:
        "https://github.com/radicle-dev/radicle-explorer/blob/master/img.png?raw=true",
    },
    {
      // Raw content host is already correct, leave it untouched.
      url: "https://raw.githubusercontent.com/radicle-dev/radicle-explorer/master/img.png",
      expected:
        "https://raw.githubusercontent.com/radicle-dev/radicle-explorer/master/img.png",
    },
    {
      // An existing query string is preserved.
      url: "https://github.com/radicle-dev/radicle-explorer/blob/master/img.png?token=abc",
      expected:
        "https://github.com/radicle-dev/radicle-explorer/blob/master/img.png?token=abc&raw=true",
    },
    {
      // The www subdomain is handled too.
      url: "https://www.github.com/radicle-dev/radicle-explorer/blob/master/img.png",
      expected:
        "https://www.github.com/radicle-dev/radicle-explorer/blob/master/img.png?raw=true",
    },
    {
      // A "blob" segment that isn't in the <owner>/<repo>/blob/ position is
      // left untouched.
      url: "https://github.com/radicle-dev/radicle-explorer/raw/master/blob/img.png",
      expected:
        "https://github.com/radicle-dev/radicle-explorer/raw/master/blob/img.png",
    },
    {
      // Non-GitHub URLs are returned unchanged.
      url: "https://example.com/img.png",
      expected: "https://example.com/img.png",
    },
    {
      // Not a valid URL, returned unchanged.
      url: "not a url",
      expected: "not a url",
    },
  ])("canonicalizeGithubImageUrl $url => $expected", ({ url, expected }) => {
    expect(utils.canonicalizeGithubImageUrl(url)).toEqual(expected);
  });
});

describe("Parse Functions", () => {
  test.each([
    {
      input: "rad:z6MkmzRwg47UWQxczLLLFfkEwpBGitjzJ1vKPE8U9ymd6fz6",
      expected: undefined,
    },
    {
      input: "did:key:z6Mkmz…md6fz6",
      expected: undefined,
    },
    {
      input: "zlatan",
      expected: undefined,
    },
    {
      input: "z6MkmzRwg47UWQxczLLLFfkEwpBGitjzJ1vKPE8U9ymd6fz6",
      expected: {
        prefix: "did:key:",
        pubkey: "z6MkmzRwg47UWQxczLLLFfkEwpBGitjzJ1vKPE8U9ymd6fz6",
      },
    },
    {
      input: "did:key:z6MkmzRwg47UWQxczLLLFfkEwpBGitjzJ1vKPE8U9ymd6fz6",
      expected: {
        prefix: "did:key:",
        pubkey: "z6MkmzRwg47UWQxczLLLFfkEwpBGitjzJ1vKPE8U9ymd6fz6",
      },
    },
  ])("parseNodeId", ({ input, expected }) => {
    expect(utils.parseNodeId(input)).toEqual(expected);
  });
});

describe("Path Manipulation", () => {
  test.each([
    {
      imagePath: "/assets/images/tux.png",
      base: "/",
      origin: "https://radicle.network",
      expected: "assets/images/tux.png",
    },
    {
      imagePath: "/tux.md",
      base: "/components/assets/README.md",
      origin: "http://localhost:3000",
      expected: "tux.md",
    },
    {
      imagePath: "assets/images/tux.png",
      base: "/",
      origin: "https://radicle.network",
      expected: "assets/images/tux.png",
    },
    {
      imagePath: "assets/images/tux.png",
      base: "/",
      origin: "http://localhost:3000",
      expected: "assets/images/tux.png",
    },
    {
      imagePath: "../tux.png",
      base: "/components/assets/README.md",
      origin: "http://localhost:3000",
      expected: "components/tux.png",
    },
    {
      imagePath: "../tux.png",
      base: "/components/assets/",
      origin: "http://localhost:3000",
      expected: "components/tux.png",
    },
    {
      imagePath: "../../tux.png",
      base: "/components/assets/images/README.md",
      origin: "http://localhost:3000",
      expected: "components/tux.png",
    },
  ])(
    "canonicalize origin: $origin base: $base, path: $imagePath => $expected",
    ({ imagePath, base, expected, origin }) => {
      expect(utils.canonicalize(imagePath, base, origin)).toEqual(expected);
    },
  );
});

describe("Date Manipulation", () => {
  test.each([
    { from: new Date("2022-01-01"), to: new Date("2022-02-01"), expected: 31 },
    { from: new Date("2022-01-01"), to: new Date("2022-01-02"), expected: 1 },
    { from: new Date("2022-01-01"), to: new Date("2022-01-01"), expected: 0 },
  ])("getDaysPassed expected: $expected ", ({ from, to, expected }) => {
    expect(utils.getDaysPassed(from, to)).toEqual(expected);
  });
  test.each([
    {
      from: new Date("2022-01-01 12:00:00"),
      to: new Date("2022-01-01 12:00:00"),
      expected: "now",
    },
    {
      from: new Date("2022-01-01 12:00:00"),
      to: new Date("2022-01-01 12:00:01"),
      expected: "1 second ago",
    },
    {
      from: new Date("2022-01-01 12:00:00"),
      to: new Date("2022-01-01 12:01:01"),
      expected: "1 minute ago",
    },
    {
      from: new Date("2022-01-01 12:00:00"),
      to: new Date("2022-01-01 13:01:01"),
      expected: "1 hour ago",
    },
    {
      from: new Date("2022-01-01 12:00:00"),
      to: new Date("2022-01-02 13:01:01"),
      expected: "yesterday",
    },
    {
      from: new Date("2022-01-01 12:00:00"),
      to: new Date("2022-01-04 13:01:01"),
      expected: "3 days ago",
    },
    {
      from: new Date("2022-01-01 12:00:00"),
      to: new Date("2022-02-02 13:01:01"),
      expected: "last month",
    },
    {
      from: new Date("2022-01-01 12:00:00"),
      to: new Date("2022-04-02 13:01:01"),
      expected: "3 months ago",
    },
    {
      from: new Date("2022-01-01 12:00:00"),
      to: new Date("2023-04-02 12:00:00"),
      expected: "more than a year ago",
    },
    {
      from: new Date("2022-03-05 12:00:00"),
      to: new Date("2026-04-02 12:00:00"),
      expected: "more than a year ago",
    },
  ])("formatTimestamp expected: $expected", ({ from, to, expected }) => {
    expect(utils.formatTimestamp(from.getTime() / 1000, to.getTime())).toEqual(
      expected,
    );
  });
});

describe("isLocal", () => {
  describe("returns true for valid local addresses", () => {
    test.each([
      { addr: "localhost", description: "bare localhost" },
      { addr: "app.localhost", description: "localhost subdomain" },
      {
        addr: "deeper.app.localhost",
        description: "nested localhost subdomain",
      },
      {
        addr: "deeper.app.localhost:8080",
        description: "nested localhost subdomain with port",
      },
      { addr: "127.0.0.1", description: "IPv4 loopback" },
      { addr: "127.0.0.1:8080", description: "IPv4 loopback with port" },
      { addr: "[::1]", description: "IPv6 loopback" },
      {
        addr: "localhost:3000",
        description: "localhost with port",
      },
    ])("$description: $addr", ({ addr }) => {
      expect(utils.isLocal(addr)).toBe(true);
    });
  });

  describe("returns false for invalid/remote addresses", () => {
    test.each([
      { addr: "example.com", description: "remote domain" },
      {
        addr: "notlocalhost",
        description: "domain that ends with 'localhost'",
      },
      {
        addr: "127.0.0.1.evil.com",
        description: "malicious domain mimicking loopback",
      },
      { addr: "192.168.1.1", description: "private network IP" },
      { addr: "10.0.0.1", description: "another private network IP" },
      { addr: "", description: "empty string" },
      { addr: "not a url", description: "invalid URL format" },
      { addr: "localhost.com", description: "domain with localhost in name" },
      { addr: "mylocalhost.com", description: "domain containing localhost" },
      {
        addr: "http://example.com",
        description: "remote domain with scheme",
      },
    ])("$description: $addr", ({ addr }) => {
      expect(utils.isLocal(addr)).toBe(false);
    });
  });
});

describe("repoSegment", () => {
  const rid = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";

  test("prefers the alias when the node advertises one", () => {
    expect(utils.repoSegment({ rid, alias: "heartwood" })).toEqual("heartwood");
  });

  test.each([
    { repo: { rid }, description: "no alias field" },
    { repo: { rid, alias: undefined }, description: "undefined alias" },
  ])("falls back to the RID with $description", ({ repo }) => {
    expect(utils.repoSegment(repo)).toEqual(rid);
  });
});

describe("repoName", () => {
  const rid = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";

  test("reads the name from the project payload", () => {
    const repo = {
      rid,
      payloads: { "xyz.radicle.project": { data: { name: "heartwood" } } },
    } as Repo;
    expect(utils.repoName(repo)).toEqual("heartwood");
  });

  test("falls back to the RID without a project payload", () => {
    const repo = { rid, payloads: {} } as Repo;
    expect(utils.repoName(repo)).toEqual(utils.formatRepositoryId(rid));
  });
});

describe("hasMorePages", () => {
  test.each([
    { loaded: 9, total: 10, expected: true },
    { loaded: 10, total: 10, expected: false },
    { loaded: 0, total: 0, expected: false },
  ])(
    "compares $loaded loaded with a total of $total",
    ({ loaded, total, expected }) => {
      expect(utils.hasMorePages(loaded, 1, 10, total)).toBe(expected);
    },
  );

  test.each([
    { loaded: 20, pages: 2, expected: true },
    { loaded: 19, pages: 2, expected: false },
    { loaded: 0, pages: 1, expected: false },
  ])(
    "without a total, $loaded loaded in $pages pages => $expected",
    ({ loaded, pages, expected }) => {
      expect(utils.hasMorePages(loaded, pages, 10, undefined)).toBe(expected);
    },
  );
});

describe("safeDecodeURIComponent", () => {
  test("decodes an encoded branch name", () => {
    expect(utils.safeDecodeURIComponent("releaseprep%2Fv27.1")).toEqual(
      "releaseprep/v27.1",
    );
  });

  test("leaves an already decoded name untouched", () => {
    expect(utils.safeDecodeURIComponent("releaseprep/v27.1")).toEqual(
      "releaseprep/v27.1",
    );
  });

  // Branch names, tags and repo aliases may all contain a bare `%`, which is
  // not a well-formed encoding and would otherwise throw.
  test("returns an undecodable segment unchanged", () => {
    expect(utils.safeDecodeURIComponent("100%")).toEqual("100%");
    expect(utils.safeDecodeURIComponent("wip/50%-done")).toEqual(
      "wip/50%-done",
    );
  });
});

describe("untwemoji", () => {
  function code(text: string) {
    const node = document.createElement("code");
    node.textContent = text;
    utils.twemoji(node);
    return node;
  }

  test("restores emoji turned into images by twemoji", () => {
    const text =
      'alert("test"); // ❌\nconfirm("test"); // ❌\nprompt("test"); // ❌\n';
    const node = code(text);
    expect(node.querySelectorAll("img.txt-emoji")).toHaveLength(3);

    utils.untwemoji(node);
    expect(node.querySelector("img")).toBeNull();
    expect(node.textContent).toEqual(text);
  });

  test("restores adjacent and multi-codepoint emoji", () => {
    const text = "❌❌✅ 👩‍💻 👍🏽 🇱🇻";
    const node = code(text);
    utils.untwemoji(node);
    expect(node.querySelector("img")).toBeNull();
    expect(node.textContent).toEqual(text);
  });

  test("leaves images that are not emoji alone", () => {
    const node = document.createElement("code");
    node.innerHTML = '<img alt="logo" src="logo.png">';
    utils.untwemoji(node);
    expect(node.innerHTML).toEqual('<img alt="logo" src="logo.png">');
  });

  test("inserts alt text as text, never as markup", () => {
    const node = document.createElement("code");
    const img = document.createElement("img");
    img.className = "txt-emoji";
    img.alt = "<img src=x onerror=alert(1)>";
    node.append(img);

    utils.untwemoji(node);
    expect(node.childElementCount).toEqual(0);
    expect(node.textContent).toEqual("<img src=x onerror=alert(1)>");
  });

  test("drops emoji images without alt text", () => {
    const node = document.createElement("code");
    node.innerHTML = 'a<img class="txt-emoji" src="/twemoji/274c.svg">b';
    utils.untwemoji(node);
    expect(node.innerHTML).toEqual("ab");
  });
});

describe("fragmentId", () => {
  test.each([
    { hash: "", expected: undefined },
    { hash: "#", expected: undefined },
    { hash: "#delegate", expected: "delegate" },
    { hash: "delegate", expected: "delegate" },
    {
      hash: "#0a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
      expected: "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
    },
    { hash: "#caf%C3%A9", expected: "café" },
    { hash: "#%", expected: undefined },
    { hash: "#%zz", expected: undefined },
    { hash: "#%E0%A4%A", expected: undefined },
  ])("fragmentId($hash) => $expected", ({ hash, expected }) => {
    expect(utils.fragmentId(hash)).toEqual(expected);
  });
});

describe("compareTagNames", () => {
  test("sorts version tags numerically, newest first", () => {
    const tags = [
      "v0.1.0",
      "v0.10.0",
      "v0.2.0",
      "v1.0.0-rc.10",
      "v1.0.0",
      "v1.0.0-rc.2",
      "v0.10.1",
    ];
    expect(tags.sort(utils.compareTagNames)).toEqual([
      "v1.0.0",
      "v1.0.0-rc.10",
      "v1.0.0-rc.2",
      "v0.10.1",
      "v0.10.0",
      "v0.2.0",
      "v0.1.0",
    ]);
  });
});

describe("groupTags", () => {
  test("keeps namespaces together, most recent first", () => {
    const tags: [string, number][] = [
      ["releases/0.29.0", 3],
      ["releases/0.9.0", 1],
      ["releases/desktop/0.16.0", 3],
      ["releases/desktop/0.17.0", 4],
      ["releases/httpd/0.29.0", 3],
      ["releases/httpd/0.30.0", 5],
    ];
    expect(
      utils
        .groupTags(tags, timestamp => timestamp)
        .map(group => ({
          namespace: group.namespace,
          tags: group.tags.map(([name]) => name),
        })),
    ).toEqual([
      {
        namespace: "releases/httpd",
        tags: ["releases/httpd/0.30.0", "releases/httpd/0.29.0"],
      },
      {
        namespace: "releases/desktop",
        tags: ["releases/desktop/0.17.0", "releases/desktop/0.16.0"],
      },
      { namespace: "releases", tags: ["releases/0.29.0", "releases/0.9.0"] },
    ]);
  });

  test("orders namespaces by name without timestamps", () => {
    const tags: [string, undefined][] = [
      ["v1.0.0", undefined],
      ["releases/httpd/0.30.0", undefined],
      ["releases/desktop/0.17.0", undefined],
    ];
    expect(
      utils.groupTags(tags).flatMap(group => group.tags.map(([name]) => name)),
    ).toEqual(["v1.0.0", "releases/desktop/0.17.0", "releases/httpd/0.30.0"]);
  });
});
