import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  canonicalizeGithubImageUrl,
  enhanceRepoImages,
  imageMimeType,
  RepoImages,
  resolveRepoPath,
} from "@app/lib/repoImages";

describe("resolveRepoPath", () => {
  test.each([
    ["notes.txt", "README.adoc", "notes.txt"],
    ["./notes.txt", "README.adoc", "notes.txt"],
    ["guide.adoc", "docs/index.adoc", "docs/guide.adoc"],
    ["../README.adoc", "docs/index.adoc", "README.adoc"],
    ["../../README.adoc", "docs/index.adoc", "README.adoc"],
    ["../notes.txt", "README.adoc", "notes.txt"],
    ["/src/main.rs", "docs/index.adoc", "src/main.rs"],
    ["my%20notes.txt", "README.adoc", "my notes.txt"],
    ["notes.txt?plain=1", "README.adoc", "notes.txt"],
    ["notes.txt#usage", "README.adoc", "notes.txt"],
    ["docs/", "README.adoc", "docs/"],
    ["50%.png", "README.md", "50%.png"],
    ["docs/100%25.png", "README.md", "docs/100%.png"],
  ])("resolves %j from %j to %j", (href, from, expected) => {
    expect(resolveRepoPath(href, from)).toBe(expected);
  });

  test.each([
    ["https://radicle.xyz", "README.adoc"],
    ["//radicle.xyz/notes.txt", "README.adoc"],
    ["mailto:alice@example.com", "README.adoc"],
    ["javascript:alert(1)", "README.adoc"],
    ["data:image/png;base64,AAAA", "README.md"],
    ["blob:tauri://localhost/1234", "README.md"],
    ["/", "README.adoc"],
    ["..", "README.adoc"],
  ])("leaves %j from %j outside the repository", (href, from) => {
    expect(resolveRepoPath(href, from)).toBeUndefined();
  });
});

describe("canonicalizeGithubImageUrl", () => {
  test.each([
    [
      "https://github.com/radicle/app/blob/main/shot.png",
      "https://github.com/radicle/app/blob/main/shot.png?raw=true",
    ],
    [
      "https://github.com/radicle/app/blob/main/shot.png?raw=true",
      "https://github.com/radicle/app/blob/main/shot.png?raw=true",
    ],
    [
      "https://raw.githubusercontent.com/radicle/app/main/shot.png",
      "https://raw.githubusercontent.com/radicle/app/main/shot.png",
    ],
    [
      "https://example.com/radicle/app/blob/main/shot.png",
      "https://example.com/radicle/app/blob/main/shot.png",
    ],
    ["shot.png", "shot.png"],
  ])("rewrites %j to %j", (input, expected) => {
    expect(canonicalizeGithubImageUrl(input)).toBe(expected);
  });
});

describe("imageMimeType", () => {
  test.each([
    ["logo.svg", "image/svg+xml"],
    ["docs/LOGO.SVG", "image/svg+xml"],
    ["shot.png", "image/png"],
  ])("of %j is %j", (path, expected) => {
    expect(imageMimeType(path)).toBe(expected);
  });

  test.each(["Makefile", "docs.v2/logo", "notes.txt", ""])(
    "of %j is unknown",
    path => {
      expect(imageMimeType(path)).toBeUndefined();
    },
  );
});

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function chunk(type: string, data: number[]): number[] {
  const name = Array.from(type, c => c.charCodeAt(0));
  return [...u32(data.length), ...name, ...data, 0, 0, 0, 0];
}

// A PNG `width` pixels wide, saved at 144 DPI like a Retina screenshot.
function retinaPng(width: number): ArrayBuffer {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk("IHDR", [...u32(width), ...u32(100), 8, 6, 0, 0, 0]),
    ...chunk("pHYs", [...u32(5669), ...u32(5669), 1]),
    ...chunk("IEND", []),
  ]).buffer;
}

let created: Blob[];
let revoked: string[];

beforeEach(() => {
  created = [];
  revoked = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    created.push(blob);
    return `blob:test/${created.length}`;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});

function fakeFetch() {
  return vi.fn(async (_rid: string, _sha: string, _path: string) => {
    return new Uint8Array([1, 2, 3]).buffer;
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("RepoImages", () => {
  test("reads each file once", async () => {
    const fetch = fakeFetch();
    const images = new RepoImages(fetch);

    const [first, second] = await Promise.all([
      images.load("rad:a", "sha1", "logo.png"),
      images.load("rad:a", "sha1", "logo.png"),
    ]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(created).toHaveLength(1);
  });

  test("reads the same path again at another revision", async () => {
    const fetch = fakeFetch();
    const images = new RepoImages(fetch);

    await images.load("rad:a", "sha1", "logo.png");
    await images.load("rad:a", "sha2", "logo.png");

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("types an SVG so the webview shows it", async () => {
    const images = new RepoImages(fakeFetch());

    await images.load("rad:a", "sha1", "docs/logo.svg");

    expect(created[0].type).toBe("image/svg+xml");
  });

  test("sizes a Retina screenshot to its intended width", async () => {
    const images = new RepoImages(async () => retinaPng(3680));

    const image = await images.load("rad:a", "sha1", "shot.png");

    expect(image?.width).toBe(1840);
  });

  test("sweeps the images not loaded since the last sweep", async () => {
    const images = new RepoImages(fakeFetch());

    const old = await images.load("rad:a", "sha1", "old.png");
    const kept = await images.load("rad:a", "sha1", "kept.png");
    images.sweep();
    await images.load("rad:a", "sha1", "kept.png");
    images.sweep();

    expect(revoked).toEqual([old?.url]);
    expect(revoked).not.toContain(kept?.url);
  });

  test("frees an image released before it loaded", async () => {
    const pending = deferred<ArrayBuffer>();
    const images = new RepoImages(() => pending.promise);

    const image = images.load("rad:a", "sha1", "logo.png");
    images.sweep();
    images.sweep();
    pending.resolve(new Uint8Array([1]).buffer);

    expect(await image).toBeUndefined();
    expect(revoked).toEqual(["blob:test/1"]);
  });

  test("tries a failed file again", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValue(new Uint8Array([1]).buffer);
    const images = new RepoImages(fetch);

    await expect(images.load("rad:a", "sha1", "logo.png")).rejects.toThrow();
    await expect(
      images.load("rad:a", "sha1", "logo.png"),
    ).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("frees every image when disposed, and those still loading", async () => {
    const pending = deferred<ArrayBuffer>();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Uint8Array([1]).buffer)
      .mockReturnValueOnce(pending.promise);
    const images = new RepoImages(fetch);

    const loaded = await images.load("rad:a", "sha1", "a.png");
    const loading = images.load("rad:a", "sha1", "b.png");
    images.dispose();
    pending.resolve(new Uint8Array([1]).buffer);

    expect(await loading).toBeUndefined();
    expect(revoked).toEqual([loaded?.url, "blob:test/2"]);
  });
});

function documentWith(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

async function settled() {
  await new Promise(resolve => setTimeout(resolve));
}

describe("enhanceRepoImages", () => {
  test("shows repository images and rewrites GitHub page URLs", async () => {
    const fetch = fakeFetch();
    const container = documentWith(
      [
        '<img src="../images/logo.svg">',
        '<img src="https://github.com/a/b/blob/main/c.png">',
        '<img src="https://example.com/d.png">',
        '<img class="txt-emoji" src="twemoji/1f600.svg">',
      ].join(""),
    );

    enhanceRepoImages(
      container,
      { rid: "rad:a", sha: "sha1", path: "docs/README.md" },
      new RepoImages(fetch),
    );
    await settled();

    const [logo, github, external, emoji] = container.querySelectorAll("img");
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "rad:a",
      "sha1",
      "images/logo.svg",
    );
    expect(logo.getAttribute("src")).toBe("blob:test/1");
    expect(github.getAttribute("src")).toBe(
      "https://github.com/a/b/blob/main/c.png?raw=true",
    );
    expect(external.getAttribute("src")).toBe("https://example.com/d.png");
    expect(emoji.getAttribute("src")).toBe("twemoji/1f600.svg");
  });

  test("leaves repository images alone without a revision", async () => {
    const fetch = fakeFetch();
    const container = documentWith('<img src="logo.png">');

    enhanceRepoImages(
      container,
      { rid: "", sha: undefined, path: "" },
      new RepoImages(fetch),
    );
    await settled();

    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "logo.png",
    );
  });

  test("a stray percent sign doesn't stop the other images", async () => {
    const fetch = fakeFetch();
    const container = documentWith('<img src="50%.png"><img src="logo.png">');

    enhanceRepoImages(
      container,
      { rid: "rad:a", sha: "sha1", path: "README.md" },
      new RepoImages(fetch),
    );
    await settled();

    expect(fetch.mock.calls.map(([, , path]) => path)).toEqual([
      "50%.png",
      "logo.png",
    ]);
  });

  test("reads the images again when the revision changes", async () => {
    const fetch = fakeFetch();
    const images = new RepoImages(fetch);
    const container = documentWith('<img src="logo.png">');

    enhanceRepoImages(
      container,
      { rid: "rad:a", sha: "sha1", path: "README.md" },
      images,
    );
    await settled();
    enhanceRepoImages(
      container,
      { rid: "rad:a", sha: "sha2", path: "README.md" },
      images,
    );
    await settled();

    expect(fetch.mock.calls).toEqual([
      ["rad:a", "sha1", "logo.png"],
      ["rad:a", "sha2", "logo.png"],
    ]);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "blob:test/2",
    );
    expect(revoked).toEqual(["blob:test/1"]);
  });

  test("an older revision loading late doesn't replace the newer one", async () => {
    const first = deferred<ArrayBuffer>();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(new Uint8Array([2]).buffer);
    const images = new RepoImages(fetch);
    const container = documentWith('<img src="logo.png">');

    enhanceRepoImages(
      container,
      { rid: "rad:a", sha: "sha1", path: "README.md" },
      images,
    );
    enhanceRepoImages(
      container,
      { rid: "rad:a", sha: "sha2", path: "README.md" },
      images,
    );
    await settled();
    first.resolve(new Uint8Array([1]).buffer);
    await settled();

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "blob:test/1",
    );
    expect(revoked).toEqual(["blob:test/2"]);
  });

  test("shows a Retina screenshot at its intended width", async () => {
    const container = documentWith('<img src="shot.png">');

    enhanceRepoImages(
      container,
      { rid: "rad:a", sha: "sha1", path: "README.md" },
      new RepoImages(async () => retinaPng(3680)),
    );
    await settled();

    expect(container.querySelector("img")?.style.width).toBe("1840px");
  });
});
