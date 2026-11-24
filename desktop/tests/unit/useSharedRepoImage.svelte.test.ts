import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { fetchRepoBytes } from "@app/lib/repoImages";
import {
  pictureFile,
  type RepoFile,
  useSharedRepoImage,
} from "@app/lib/useSharedRepoImage.svelte";

vi.mock("@app/lib/repoImages", async importOriginal => ({
  ...(await importOriginal<typeof import("@app/lib/repoImages")>()),
  fetchRepoBytes: vi.fn(),
}));

describe("pictureFile", () => {
  const actor = {
    rid: "rad:z3hRfcMeTzYu9hXNoKee9TJWRKvSP",
    head: "78113a70803374f5d87cb80d599d9a76a81f4ff2",
    profile: { avatar: " pictures/me.png ", banner: "banner.png" },
  };

  test("names the file in the profile's repository at its commit", () => {
    expect(pictureFile(actor, "avatar")).toEqual({
      rid: actor.rid,
      sha: actor.head,
      path: "pictures/me.png",
    });
    expect(pictureFile(actor, "banner")?.path).toBe("banner.png");
  });

  test.each([
    ["no actor", undefined],
    ["a missing actor", null],
    ["no profile", { ...actor, profile: undefined }],
    ["no commit", { ...actor, head: undefined }],
    ["no picture", { ...actor, profile: {} }],
    ["an empty picture", { ...actor, profile: { avatar: "  " } }],
    ["a web address", { ...actor, profile: { avatar: "https://a.b/c.png" } }],
    ["any other scheme", { ...actor, profile: { avatar: "data:image/png," } }],
  ])("names nothing for %s", (_, given) => {
    expect(pictureFile(given, "avatar")).toBeUndefined();
  });
});

describe("useSharedRepoImage", () => {
  const read = vi.mocked(fetchRepoBytes);
  let made = 0;
  let revoked: string[] = [];
  // Each test reads a file of its own, since the pictures outlive a test.
  let file: RepoFile;

  beforeEach(() => {
    vi.useFakeTimers();
    read.mockReset();
    revoked = [];
    made += 1;
    file = { rid: "rad:z3hRf", sha: `commit-${made}`, path: "avatar.png" };
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      () => `blob:picture-${(made += 1)}`,
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(url => {
      revoked.push(url);
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Shows `shown()` as a component would, until the returned function runs.
  function show(shown: () => RepoFile | undefined = () => file) {
    let image: ReturnType<typeof useSharedRepoImage> | undefined;
    const unmount = $effect.root(() => {
      image = useSharedRepoImage(shown);
    });
    flushSync();
    if (!image) throw new Error("The picture was not created");

    return { image, unmount };
  }

  async function settle() {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
  }

  test("reads a file once for every component that shows it", async () => {
    read.mockResolvedValue(new ArrayBuffer(1));

    const first = show();
    const second = show();
    await settle();

    expect(read).toHaveBeenCalledTimes(1);
    expect(first.image.url).toMatch(/^blob:/);
    expect(second.image.url).toBe(first.image.url);

    // One that mounts later has the picture from its first render.
    const third = show();
    expect(third.image.url).toBe(first.image.url);
    expect(read).toHaveBeenCalledTimes(1);

    for (const { unmount } of [first, second, third]) unmount();
  });

  test("keeps a picture while it is shown and for a while after", async () => {
    read.mockResolvedValue(new ArrayBuffer(1));

    const first = show();
    const second = show();
    await settle();
    const url = first.image.url;

    first.unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(revoked).toEqual([]);

    second.unmount();
    await vi.advanceTimersByTimeAsync(29_000);
    expect(revoked).toEqual([]);

    // Shown again in time, it is neither released nor read again.
    const third = show();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(third.image.url).toBe(url);
    expect(revoked).toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);

    third.unmount();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(revoked).toEqual([url]);

    const fourth = show();
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    fourth.unmount();
  });

  test("shares a failed read, warns once and retries once unused", async () => {
    read.mockRejectedValue(new Error("no such file"));

    const first = show();
    const second = show();
    await settle();

    expect(first.image.failed).toBe(true);
    expect(second.image.failed).toBe(true);
    expect(first.image.url).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);

    // Still shown, so it is not read again, however long it stays.
    await vi.advanceTimersByTimeAsync(120_000);
    const third = show();
    expect(third.image.failed).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);

    for (const { unmount } of [first, second, third]) unmount();
    await vi.advanceTimersByTimeAsync(30_000);

    read.mockResolvedValue(new ArrayBuffer(1));
    const fourth = show();
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    expect(fourth.image.failed).toBe(false);
    expect(fourth.image.url).toMatch(/^blob:/);
    fourth.unmount();
  });

  test("keeps the picture shown until the next commit's has loaded", async () => {
    read.mockResolvedValue(new ArrayBuffer(1));
    let shown = $state(file);

    const { image, unmount } = show(() => shown);
    await settle();
    const before = image.url;

    let arrive: (bytes: ArrayBuffer) => void = () => undefined;
    read.mockReturnValue(new Promise(resolve => (arrive = resolve)));
    shown = { ...file, sha: `${file.sha}-next` };
    flushSync();
    expect(image.url).toBe(before);

    arrive(new ArrayBuffer(1));
    await settle();
    expect(image.url).not.toBe(before);
    expect(image.url).toMatch(/^blob:/);

    unmount();
  });

  test("shows nothing once there is no file to show", async () => {
    read.mockResolvedValue(new ArrayBuffer(1));
    let shown = $state<RepoFile | undefined>(file);

    const { image, unmount } = show(() => shown);
    await settle();
    expect(image.url).toMatch(/^blob:/);

    shown = undefined;
    flushSync();
    expect(image.url).toBeUndefined();
    expect(image.failed).toBe(false);

    unmount();
  });
});
