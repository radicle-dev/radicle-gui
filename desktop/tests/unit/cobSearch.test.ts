import { expect, test } from "vitest";

import { searchCobs } from "@app/lib/cobSearch";

import { author } from "./support/cobs";

function cob(
  id: string,
  props: Partial<Parameters<typeof searchCobs>[1][0]> = {},
) {
  return {
    id,
    title: "Untitled",
    labels: [],
    assignees: [],
    author: author("nobody", null),
    ...props,
  };
}

const cobs = [
  cob("1", { title: "Crash on startup" }),
  cob("2", { labels: ["regression", "ui"] }),
  cob("3", { assignees: [author("a", null), author("b", "bob")] }),
  cob("4", { author: author("c", "carol") }),
  cob("deadbeef"),
];

test("lists everything for an empty query", () => {
  expect(searchCobs("", cobs).map(c => c.id)).toEqual([
    "1",
    "2",
    "3",
    "4",
    "deadbeef",
  ]);
});

test.each([
  ["startup", "1"],
  ["regression", "2"],
  ["bob", "3"],
  ["carol", "4"],
  ["deadbeef", "deadbeef"],
])("finds %j in cob %j", (query, id) => {
  expect(searchCobs(query, cobs).map(c => c.id)).toEqual([id]);
});
