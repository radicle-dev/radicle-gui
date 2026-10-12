import type { Author } from "@bindings/cob/Author";
import type { Action } from "@bindings/cob/issue/Action";
import type { Issue } from "@bindings/cob/issue/Issue";
import type { Operation } from "@bindings/cob/Operation";

import type { ActivityItem, FlattenedAction } from "@app/lib/cobActivity";
import { flattenActivity } from "@app/lib/cobActivity";

export type FlattenedIssueOperation =
  | FlattenedAction<Action>
  | { type: "opened"; id: string; author: Author; timestamp: number };

// Comments render as threads beside the timeline, not as entries in it.
const skip = new Set<Action["type"]>([
  "comment",
  "comment.edit",
  "comment.react",
  "comment.redact",
]);

/// The issue's timeline: an "opened" entry, then one entry per action worth
/// showing.
export function issueTimeline(
  issue: Issue,
  activity: Operation<Action>[],
): ActivityItem<FlattenedIssueOperation>[] {
  const opened = issue.body?.edits[0]?.timestamp ?? issue.timestamp;
  return [
    {
      key: `${issue.id}:opened`,
      timestamp: opened,
      data: {
        type: "opened",
        id: issue.id,
        author: issue.author,
        timestamp: opened,
      },
    },
    ...flattenActivity(activity, { skip }),
  ];
}
