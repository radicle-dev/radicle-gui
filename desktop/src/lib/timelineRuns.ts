import type { Author } from "@bindings/cob/Author";
import type { Thread } from "@bindings/cob/thread/Thread";

import type { ActivityItem } from "@app/lib/cobActivity";

export type TimelineEntry<A> =
  | { kind: "thread"; key: string; timestamp: number; thread: Thread }
  | {
      kind: "activity";
      key: string;
      timestamp: number;
      data: A;
      standalone: boolean;
    };

type ActivityEntry<A> = Extract<TimelineEntry<A>, { kind: "activity" }>;

export type Run<A> =
  | { kind: "thread"; entry: Extract<TimelineEntry<A>, { kind: "thread" }> }
  | { kind: "single"; entry: ActivityEntry<A>; repeatsAuthor: boolean }
  | {
      kind: "group";
      author: Author;
      entries: ActivityEntry<A>[];
      repeatsAuthor: boolean;
    };

/// Comment threads and activity in one list, oldest first.
export function mergeTimeline<A>(
  threads: Thread[],
  activity: ActivityItem<A>[],
): TimelineEntry<A>[] {
  return [
    ...threads.map(
      thread =>
        ({
          kind: "thread",
          key: thread.root.id,
          timestamp: thread.root.edits[0].timestamp,
          thread,
        }) satisfies TimelineEntry<A>,
    ),
    ...activity.map(
      item =>
        ({
          kind: "activity",
          key: item.key,
          timestamp: item.timestamp,
          data: item.data,
          standalone: item.standalone === true,
        }) satisfies TimelineEntry<A>,
    ),
  ].sort((a, b) => a.timestamp - b.timestamp);
}

/// Groups consecutive activity by the same author under one heading.
///
/// A thread or a standalone entry breaks a run. A run only names its author
/// when the run before it was someone else's (`repeatsAuthor` is false), so the
/// same person's actions aren't re-attributed on the other side of their own
/// comment.
export function timelineRuns<A>(
  timeline: TimelineEntry<A>[],
  authorOf: (data: A) => Author | undefined = () => undefined,
): Run<A>[] {
  const entryAuthor = (entry: TimelineEntry<A>) =>
    entry.kind === "thread" ? entry.thread.root.author : authorOf(entry.data);
  const runAuthor = (run: Run<A>) => {
    if (run.kind === "thread") return run.entry.thread.root.author;
    if (run.kind === "single") return entryAuthor(run.entry);
    return run.author;
  };

  const result: Run<A>[] = [];
  for (const entry of timeline) {
    if (entry.kind === "thread") {
      result.push({ kind: "thread", entry });
      continue;
    }
    const author = entryAuthor(entry);
    const last = result[result.length - 1];
    const groupable =
      !entry.standalone && !(last?.kind === "single" && last.entry.standalone);
    if (
      groupable &&
      author &&
      last &&
      ((last.kind === "single" &&
        entryAuthor(last.entry)?.did === author.did) ||
        (last.kind === "group" && last.author.did === author.did))
    ) {
      if (last.kind === "single") {
        result[result.length - 1] = {
          kind: "group",
          author,
          entries: [last.entry, entry],
          repeatsAuthor: last.repeatsAuthor,
        };
      } else {
        last.entries.push(entry);
      }
    } else {
      result.push({ kind: "single", entry, repeatsAuthor: false });
    }
  }
  for (let i = 1; i < result.length; i++) {
    const run = result[i];
    if (run.kind === "thread") continue;
    const previous = runAuthor(result[i - 1]);
    const current = runAuthor(run);
    run.repeatsAuthor = Boolean(
      previous && current && previous.did === current.did,
    );
  }
  return result;
}
