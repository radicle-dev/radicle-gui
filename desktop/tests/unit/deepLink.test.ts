import type { Config } from "@bindings/config/Config";

import { describe, expect, test, vi } from "vitest";

import {
  createLinkQueue,
  deepLinkTarget,
  parseDeepLink,
} from "@app/lib/deepLink";

const repo = "z3gqcJUoA1n9HaHKufZs5FCSGazv5";
const rid = `rad:${repo}`;
const oid = "5e4683023476778201ab25c87e1343fbfbe67c89";
const nid = "z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi";
const config = {
  publicExplorer: "https://radicle.network/nodes/$host/$rid$path",
  preferredSeeds: [],
} as unknown as Config;
const explorer = `https://radicle.network/nodes/oak.radicle.garden/${rid}`;

function target(link: string, local = true) {
  return deepLinkTarget(parseDeepLink(link)!, local, config);
}

describe("parseDeepLink", () => {
  test.each([
    rid,
    `rad:///${repo}`,
    `  ${rid}\n`,
    `rad:///${rid}`,
    `rad://${rid}`,
    `rad:${rid}`,
  ])("accepts %j", link => {
    expect(parseDeepLink(link)).toEqual({ type: "uri", uri: { repo } });
  });

  test.each([
    `did:key:${nid}`,
    "https://radicle.network",
    `web+${rid}`,
    "rad:bogus",
  ])("rejects %j", link => {
    expect(parseDeepLink(link)).toBeUndefined();
  });
});

describe("deepLinkTarget", () => {
  test.each([
    [rid, { resource: "repo.home", rid }],
    [
      `${rid}/cob/xyz.radicle.patch/${oid}`,
      {
        resource: "repo.patch",
        rid,
        patch: oid,
        status: undefined,
        reviewId: undefined,
      },
    ],
    [
      `${rid}/cob/dev.radicle.artifact/${oid}`,
      { resource: "repo.release", rid, release: oid },
    ],
    [`${rid}/commit/${oid}`, { resource: "repo.commit", rid, commit: oid }],
    [
      `${rid}/commit/main?path=src/lib.rs#L10`,
      { resource: "repo.home", rid, revision: "main", path: "src/lib.rs" },
    ],
  ])("opens %s in-app when the repo is here", (link, route) => {
    expect(target(link)).toEqual({ type: "route", route });
  });

  test("offers to seed a repo that is not here", () => {
    expect(target(`${rid}/cob/xyz.radicle.issue/${oid}`, false)).toEqual({
      type: "missing",
      rid,
      url: `${explorer}/issues/${oid}`,
    });
  });

  test("offers to seed a repo that is not here when nothing has a page", () => {
    expect(target(`${rid}/tree/${oid}`, false)).toEqual({
      type: "missing",
      rid,
      url: undefined,
    });
  });

  test("goes nowhere when neither has a page", () => {
    expect(target(`${rid}/tree/${oid}`)).toBeUndefined();
  });
});

describe("createLinkQueue", () => {
  function setup(fail?: string) {
    const opened: string[] = [];
    let running = 0;
    let overlapped = false;
    const queue = createLinkQueue(async link => {
      running++;
      overlapped ||= running > 1;
      await new Promise(resolve => setTimeout(resolve, 1));
      running--;
      if (link === fail) throw new Error(link);
      opened.push(link);
    });
    return { queue, opened, overlapped: () => overlapped };
  }
  const settle = () => new Promise(resolve => setTimeout(resolve, 20));

  test("holds links until the app is ready", async () => {
    const { queue, opened } = setup();
    queue.receive(["a"]);
    await settle();
    expect(opened).toEqual([]);

    queue.ready();
    queue.receive(["b"]);
    await settle();
    expect(opened).toEqual(["a", "b"]);
  });

  test("opens links one at a time, past a failing one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { queue, opened, overlapped } = setup("b");
    queue.ready();
    queue.receive(["a", "b"]);
    queue.receive(["c"]);
    await settle();
    expect(opened).toEqual(["a", "c"]);
    expect(overlapped()).toBe(false);
  });
});
