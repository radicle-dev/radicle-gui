import type { Commit } from "@bindings/repo/Commit";

export type CommitGroup = {
  key: string;
  label: string;
  commits: Commit[];
};

export type CommitRow =
  | { type: "header"; key: string; label: string }
  | { type: "commit"; commit: Commit; first: boolean; last: boolean };

/// The local calendar day of a timestamp in milliseconds, as `YYYY-MM-DD`.
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

/// "Today", "Yesterday", or the full date.
export function dayLabel(timestamp: number, now = Date.now()): string {
  const today = new Date(now);
  const yesterday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1,
  );

  if (dayKey(timestamp) === dayKey(today.getTime())) {
    return "Today";
  }
  if (dayKey(timestamp) === dayKey(yesterday.getTime())) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

/// Commits grouped by the day they were committed, in order of each day's first
/// commit.
export function groupCommitsByDay(
  commits: Commit[],
  now = Date.now(),
): CommitGroup[] {
  const groups = new Map<string, CommitGroup>();
  for (const commit of commits) {
    const timestamp = commit.committer.time * 1000;
    const key = dayKey(timestamp);
    const group = groups.get(key);
    if (group) {
      group.commits.push(commit);
    } else {
      groups.set(key, {
        key,
        label: dayLabel(timestamp, now),
        commits: [commit],
      });
    }
  }
  return [...groups.values()];
}

/// The groups as one stream of rows, so the list can be virtualized. `first`
/// and `last` mark a group's boundaries so its commits form a bordered card.
export function commitRowsOf(groups: CommitGroup[]): CommitRow[] {
  return groups.flatMap(group => [
    { type: "header" as const, key: group.key, label: group.label },
    ...group.commits.map((commit, i) => ({
      type: "commit" as const,
      commit,
      first: i === 0,
      last: i === group.commits.length - 1,
    })),
  ]);
}
