import { cachedRepoActivity } from "@app/lib/invoke";

/** One week's worth of commits, as consumed by the activity sparkline. */
export interface WeeklyActivity {
  time: number;
  commits: number[];
  week: number;
}

function daysPassed(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Bucket commit timestamps (unix seconds, any order) into weeks, newest first.
 * `week` counts weeks back from today, so gaps between buckets are preserved
 * and the sparkline can render inactive stretches.
 */
export function groupCommitsByWeek(timestamps: number[]): WeeklyActivity[] {
  if (timestamps.length === 0) {
    return [];
  }

  const sorted = [...timestamps].sort((a, b) => b - a);
  const grouped: WeeklyActivity[] = [];
  let groupDate: Date | undefined = undefined;
  let weekAccumulator = Math.floor(
    daysPassed(new Date(sorted[0] * 1000), new Date()) / 7,
  );

  for (const timestamp of sorted) {
    const time = timestamp * 1000;
    const date = new Date(time);
    const isNewWeek =
      grouped.length === 0 ||
      !groupDate ||
      daysPassed(date, groupDate) > 7 ||
      date.getFullYear() < groupDate.getFullYear();

    if (isNewWeek) {
      const passed = groupDate ? daysPassed(date, groupDate) : 0;
      grouped.push({
        time,
        commits: [],
        week: Math.floor(passed / 7) + weekAccumulator,
      });
      groupDate = date;
      weekAccumulator += Math.floor(passed / 7);
    }
    grouped[grouped.length - 1].commits.push(timestamp);
  }

  return grouped;
}

export async function loadRepoActivity(
  rid: string,
  head: string,
): Promise<WeeklyActivity[]> {
  return groupCommitsByWeek(await cachedRepoActivity(rid, head));
}
