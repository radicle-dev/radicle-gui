import type { NotificationItem } from "@bindings/cob/inbox/NotificationItem";

// A notification is relevant when the local node authored, was assigned, or
// took part in the issue or patch it belongs to.
export function involvesMe(group: NotificationItem[]): boolean {
  return group.some(
    item =>
      item.relevance.authored ||
      item.relevance.assigned ||
      item.relevance.participating,
  );
}

export type DateGroup = {
  key: string;
  label: string;
  /** The label as it reads mid-sentence, e.g. "from this week". */
  subject: string;
};

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

// Buckets a timestamp into the headline it belongs under, in local time.
export function dateGroupOf(
  timestamp: number,
  current = new Date().getTime(),
): DateGroup {
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date(current);
  const today = startOfDay(now);

  if (timestamp >= today) {
    return { key: "today", label: "Today", subject: "today" };
  }
  if (timestamp >= today - DAY) {
    return { key: "yesterday", label: "Yesterday", subject: "yesterday" };
  }
  if (timestamp >= today - 7 * DAY) {
    return { key: "week", label: "This week", subject: "this week" };
  }

  const date = new Date(timestamp);
  const key = `${date.getFullYear()}-${date.getMonth()}`;
  if (key === `${now.getFullYear()}-${now.getMonth()}`) {
    return { key: "month", label: "This month", subject: "this month" };
  }

  // Month names keep their capitals wherever they are used.
  const label = date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return { key, label, subject: label };
}

export function latestTimestampOf(groups: NotificationItem[][]): number {
  let latest = 0;
  for (const group of groups) {
    for (const item of group) {
      if (item.timestamp > latest) {
        latest = item.timestamp;
      }
      for (const action of item.actions) {
        if (action.timestamp > latest) {
          latest = action.timestamp;
        }
      }
    }
  }
  return latest;
}
