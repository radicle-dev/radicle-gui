import type { NotificationItem } from "@bindings/cob/inbox/NotificationItem";
import type { Action as IssueAction } from "@bindings/cob/issue/Action";
import type { Action as PatchAction } from "@bindings/cob/patch/Action";

import { describe, expect, test } from "vitest";

import type { Action as NotificationAction } from "@app/lib/notification";
import {
  compressActions,
  createSummary,
  notificationActions,
  notificationIcon,
  notificationRoute,
} from "@app/lib/notification";
import { formatOid } from "@app/lib/utils";

const oid = "e8f95f5082a8e99c290ab3908a926e1de5c97d6c";
const revision = "eb3d92ddbd4394bbd6896a99152afb1f8647d6ca";
const actionOid = "22d3ec4b78314f83a43add9b72382c6fbc44c8b6";
const timestamp = 1737622257;
const author = {
  did: "did:key:z6MkwPUeUS2fJMfc2HZN1RQTQcTTuhw4HhPySB8JeUg2mVvx",
  alias: "rudolfs",
};

const createAction = (
  action: IssueAction | PatchAction,
  oid = actionOid,
): NotificationAction => ({
  oid,
  timestamp,
  author,
  ...action,
});

describe("Action summaries", () => {
  test.each([
    {
      summary: "Review without verdict",
      input: [createAction({ type: "review", revision })],
      output: `left a review with a comment on revision <span class="txt-id">${formatOid(revision)}</span>`,
    },
    {
      summary: "Review with accepted verdict",
      input: [createAction({ type: "review", verdict: "accept", revision })],
      output: `accepted revision <span class="txt-id">${formatOid(revision)}</span> with a review`,
    },
    {
      summary: "Review with rejected verdict",
      input: [createAction({ type: "review", verdict: "reject", revision })],
      output: `rejected revision <span class="txt-id">${formatOid(revision)}</span> with a review`,
    },
    {
      summary: "Add multiple labels",
      input: [
        createAction({
          type: "label",
          labels: ["bug", "ux"],
        }),
        createAction({
          type: "label",
          labels: ["design"],
        }),
      ],
      output: "added labels",
    },
    {
      summary: "Leave multiple review comments",
      input: [
        createAction({
          type: "review.comment",
          body: "A review comment",
          review: oid,
        }),
        createAction({
          type: "review.comment",
          body: "Next review comment",
          review: oid,
        }),
      ],
      output: "left 2 review comments",
    },
  ])(
    "$summary => $output",
    ({ input, output }: { input: NotificationAction[]; output: string }) => {
      expect(compressActions(input, "patch", oid)[0].summary).toEqual(output);
    },
  );

  test.each([
    {
      summary: "Create new revision",
      input: [
        createAction({
          type: "revision",
          oid: revision,
          description: "",
          base: oid,
        }),
      ],
      output: `created revision <span class="txt-id">${formatOid(revision)}</span>`,
    },
    {
      summary: "Merge revision",
      input: [
        createAction({
          type: "merge",
          revision,
          commit: actionOid,
        }),
      ],
      output: `merged revision <span class="txt-id">${formatOid(revision)}</span>`,
    },
  ])(
    "$summary => $output",
    ({ input, output }: { input: NotificationAction[]; output: string }) => {
      expect(compressActions(input, "patch", oid)[0].summary).toEqual(output);
    },
  );

  test.each([
    {
      summary: "Close patch",
      input: [
        createAction({
          type: "lifecycle",
          state: { status: "closed", reason: "other" },
        }),
      ],
      output: "closed patch",
    },
    {
      summary: "Close patch as solved",
      input: [
        createAction({
          type: "lifecycle",
          state: { status: "closed", reason: "solved" },
        }),
      ],
      output: "closed patch as solved",
    },
    {
      summary: "Archive patch",
      input: [
        createAction({ type: "lifecycle", state: { status: "archived" } }),
      ],
      output: "archived patch",
    },
    {
      summary: "Reopen patch",
      input: [createAction({ type: "lifecycle", state: { status: "open" } })],
      output: "reopened patch",
    },
    {
      summary: "Change patch to draft",
      input: [createAction({ type: "lifecycle", state: { status: "draft" } })],
      output: "changed to draft",
    },
    {
      summary: "More than one lifecycle change",
      input: [
        createAction({ type: "lifecycle", state: { status: "draft" } }),
        createAction({ type: "lifecycle", state: { status: "open" } }),
      ],
      output: "changed to open and 2 more changes",
    },
  ])(
    "$summary => $output",
    ({ input, output }: { input: NotificationAction[]; output: string }) => {
      expect(createSummary(input, "patch", oid, input.length)).toEqual(output);
    },
  );

  test.each([
    {
      summary: "Open patch with an edit and a comment action",
      type: "patch" as const,
      input: [
        createAction({ type: "edit", title: "Lorem ipsum" }, oid),
        createAction({ type: "comment", body: "A patch title" }, oid),
      ],
      output: `opened patch <span class="txt-id">${formatOid(oid)}</span>`,
    },
    {
      summary: "Open issue where the action has the same oid than the cob",
      type: "issue" as const,
      input: [createAction({ type: "edit", title: "Lorem ipsum" }, oid)],
      output: `opened issue <span class="txt-id">${formatOid(oid)}</span>`,
    },
    {
      summary: "Leave two comments in one operation",
      type: "issue" as const,
      input: [
        createAction({ type: "comment", body: "Lorem ipsum" }),
        createAction({ type: "comment", body: "A patch title" }),
      ],
      output: `left 2 comments`,
    },
  ])(
    "$summary => $output",
    ({
      type,
      input,
      output,
    }: {
      type: "patch" | "issue";
      input: NotificationAction[];
      output: string;
    }) => {
      expect(createSummary(input, type, oid, input.length)).toEqual(output);
    },
  );
});

describe("notificationActions", () => {
  const comment = (body: string, at = timestamp) => ({
    ...createAction({ type: "review.comment", body, review: oid }),
    timestamp: at,
  });

  test("keeps an action once when two notifications include it", () => {
    const shared = comment("A review comment");

    expect(
      notificationActions([
        { actions: [shared] },
        { actions: [{ ...shared }] },
      ]),
    ).toEqual([shared]);
  });

  test("keeps same-type actions from one operation", () => {
    const actions = notificationActions([
      { actions: [comment("First"), comment("Second"), comment("Third")] },
    ]);

    expect(actions).toHaveLength(3);
    expect(compressActions(actions, "patch", oid)[0].summary).toBe(
      "left 3 review comments",
    );
  });

  test("orders actions newest first", () => {
    expect(
      notificationActions([
        { actions: [comment("old", 1)] },
        { actions: [comment("new", 3), comment("middle", 2)] },
      ]).map(a => a.timestamp),
    ).toEqual([3, 2, 1]);
  });
});

function item(
  type: "issue" | "patch",
  status: NotificationItem["status"],
): NotificationItem {
  return {
    type,
    rowId: "1",
    id: oid,
    update: { type: "created", name: "refs/cobs/x", oid },
    title: "Title",
    timestamp,
    status,
    actions: [],
    repoId: "rad:z",
  } as NotificationItem;
}

describe("notification teaser", () => {
  test.each([
    [item("issue", { status: "open" }), "issue"],
    [item("issue", { status: "closed", reason: "solved" }), "issue-closed"],
    [item("patch", { status: "open" }), "patch"],
    [item("patch", { status: "draft" }), "patch-draft"],
    [
      item("patch", { status: "merged", revision, commit: oid }),
      "patch-merged",
    ],
    [undefined, "patch"],
  ])("icon of %# is %j", (notification, expected) => {
    expect(notificationIcon(notification)).toBe(expected);
  });

  test("routes to the patch or to the issue in every status", () => {
    expect(
      notificationRoute("rad:z", item("patch", { status: "open" })),
    ).toEqual({
      resource: "repo.patch",
      rid: "rad:z",
      patch: oid,
      status: undefined,
      reviewId: undefined,
    });
    expect(
      notificationRoute("rad:z", item("issue", { status: "open" })),
    ).toEqual({
      resource: "repo.issue",
      rid: "rad:z",
      issue: oid,
      status: "all",
    });
    expect(notificationRoute("rad:z", undefined)).toBeUndefined();
  });
});
