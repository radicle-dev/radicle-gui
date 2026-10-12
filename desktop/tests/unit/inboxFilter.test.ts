import type { Author } from "@bindings/cob/Author";
import type { NotificationItem } from "@bindings/cob/inbox/NotificationItem";
import type { NotificationsByRepo } from "@bindings/cob/inbox/NotificationsByRepo";

import { describe, expect, test } from "vitest";

import { filterNotifications, rowIdsOf } from "@app/lib/inboxFilter";

import { author } from "./support/cobs";

function issue(
  id: string,
  rowId: string,
  props: { title?: string; authors?: Author[]; closed?: boolean } = {},
): NotificationItem {
  const { title = "Untitled", authors = [author("alice")], closed } = props;
  return {
    type: "issue",
    rowId,
    id,
    update: { type: "created", name: "refs/cobs", oid: "o" },
    title,
    timestamp: 0,
    status: closed
      ? { status: "closed", reason: "solved" }
      : { status: "open" },
    actions: authors.map(by => ({
      type: "edit",
      title,
      oid: "o",
      timestamp: 0,
      author: by,
    })),
    repoId: "rad:z1",
  };
}

function repo(
  rid: string,
  notifications: NotificationItem[][],
): NotificationsByRepo {
  return { rid, name: rid, notifications, count: 99 };
}

const crash = [issue("aaa111", "1", { title: "Crash on startup" })];
const renamed = [
  issue("bbb222", "2", { title: "Old wording" }),
  issue("bbb222", "3", {
    title: "Sidebar overflow",
    authors: [author("bob"), author("carol", null)],
    closed: true,
  }),
];
const repos = [repo("rad:z1", [crash, renamed]), repo("rad:z2", [])];

function ids(query: string, excluded?: string[]) {
  return filterNotifications(repos, query, excluded).map(r => ({
    rid: r.repo.rid,
    ids: r.groups.map(g => g[0].id),
  }));
}

describe("filterNotifications", () => {
  test.each(["", "   "])("returns every repo unchanged for %j", query => {
    expect(filterNotifications(repos, query)).toEqual([
      { repo: repos[0], groups: [crash, renamed], count: 99 },
      { repo: repos[1], groups: [], count: 99 },
    ]);
  });

  test.each([
    ["the latest title", "sidebar"],
    ["the latest state", "closed"],
    ["an alias from any item", "bob"],
    ["a DID", "z6Mkcarol"],
    ["the id", "bbb222"],
  ])("matches %s", (_, query) => {
    expect(ids(query)).toEqual([{ rid: "rad:z1", ids: ["bbb222"] }]);
  });

  test("matches the type", () => {
    expect(ids("issue")[0].ids).toEqual(
      expect.arrayContaining(["aaa111", "bbb222"]),
    );
  });

  test.each([
    ["an earlier title", "wording"],
    ["a missing alias", "undefined"],
    ["a weak fuzzy match", "cso"],
  ])("doesn't match %s", (_, query) => {
    expect(ids(query)).toEqual([]);
  });

  test("counts the items of the matching groups", () => {
    expect(filterNotifications(repos, "sidebar")[0].count).toBe(2);
  });

  test("drops excluded groups and repos left empty", () => {
    expect(ids("crash", ["aaa111"])).toEqual([]);
  });
});

test("rowIdsOf lists the rows of every group", () => {
  expect(rowIdsOf([crash, renamed])).toEqual(["1", "2", "3"]);
});
