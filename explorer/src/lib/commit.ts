import type { BaseUrl, CommitHeader } from "@http-client";

import { LinkifyIt } from "linkify-it";
import dompurify from "dompurify";
import escape from "lodash/escape";

import { getDaysPassed } from "@app/lib/utils";
import { HttpdClient } from "@http-client";

const linkify = new LinkifyIt({ fuzzyLink: false });

// A set of commits grouped by time.
interface CommitGroup {
  date: string;
  time: number;
  commits: CommitHeader[];
  week: number;
}

export interface WeeklyActivity {
  date: string;
  time: number;
  commits: number[];
  week: number;
}

function formatGroupTime(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    day: "numeric",
    weekday: "long",
    month: "long",
    year: "numeric",
  });
}

export function groupCommits(commits: CommitHeader[]): CommitGroup[] {
  const groupedCommits: CommitGroup[] = [];
  let groupDate: Date | undefined = undefined;

  commits = commits.sort((a, b) => {
    if (a.committer.time > b.committer.time) {
      return -1;
    } else if (a.committer.time < b.committer.time) {
      return 1;
    }

    return 0;
  });

  for (const commit of commits) {
    const time = commit.committer.time * 1000;
    const date = new Date(time);
    const isNewDay =
      !groupedCommits.length ||
      !groupDate ||
      date.getDate() < groupDate.getDate() ||
      date.getMonth() < groupDate.getMonth() ||
      date.getFullYear() < groupDate.getFullYear();

    if (isNewDay) {
      groupedCommits.push({
        date: formatGroupTime(time),
        time,
        commits: [],
        week: 0,
      });
      groupDate = date;
    }
    groupedCommits[groupedCommits.length - 1].commits.push(commit);
  }
  return groupedCommits;
}

function groupCommitsByWeek(commits: number[]): WeeklyActivity[] {
  const groupedCommits: WeeklyActivity[] = [];
  let groupDate: Date | undefined = undefined;

  if (commits.length === 0) {
    return [];
  }

  commits = commits.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));

  // A accumulator that increments by the amount of weeks between weekly commit groups
  let weekAccumulator = Math.floor(
    getDaysPassed(new Date(commits[0] * 1000), new Date()) / 7,
  );

  // Loops over all commits and stores them by week with some additional metadata in groupedCommits.
  for (const commit of commits) {
    const time = commit * 1000;
    const date = new Date(time);
    const isNewWeek =
      !groupedCommits.length ||
      !groupDate ||
      getDaysPassed(date, groupDate) > 7 ||
      date.getFullYear() < groupDate.getFullYear();

    if (isNewWeek) {
      let daysPassed = 0;
      if (groupDate) {
        daysPassed = getDaysPassed(date, groupDate);
      }
      groupedCommits.push({
        date: formatGroupTime(time),
        time,
        commits: [],
        week: Math.floor(daysPassed / 7) + weekAccumulator,
      });
      groupDate = date;
      weekAccumulator += Math.floor(daysPassed / 7);
    }
    groupedCommits[groupedCommits.length - 1].commits.push(commit);
  }

  return groupedCommits;
}

// Renders a commit description as safe HTML, with bare URLs converted to
// `<radicle-external-link>` components.
export function renderCommitDescription(text: string): string {
  const trimmed = text.trim();
  // Match http(s) only; avoids turning bare emails into `mailto:` links inside
  // commit messages.
  const matches = (linkify.match(trimmed) ?? []).filter(
    m => m.schema === "http:" || m.schema === "https:",
  );
  let out = "";
  let cursor = 0;
  for (const m of matches) {
    // CommonMark autolink: `<https://example.com>`. Drop the surrounding
    // brackets from the visible output rather than rendering them as text.
    const isAutolink =
      trimmed[m.index - 1] === "<" && trimmed[m.lastIndex] === ">";
    const segmentEnd = isAutolink ? m.index - 1 : m.index;
    out += escape(trimmed.slice(cursor, segmentEnd));
    const href = escape(m.url);
    const display = escape(m.text);
    out += `<radicle-external-link href="${href}">${display}</radicle-external-link>`;
    cursor = isAutolink ? m.lastIndex + 1 : m.lastIndex;
  }
  out += escape(trimmed.slice(cursor));
  return dompurify.sanitize(out, {
    /* eslint-disable @typescript-eslint/naming-convention */
    ALLOWED_TAGS: ["radicle-external-link"],
    ALLOWED_ATTR: ["href"],
    /* eslint-enable @typescript-eslint/naming-convention */
  }) as string;
}

export async function loadRepoActivity(
  id: string,
  baseUrl: BaseUrl,
  signal?: AbortSignal,
) {
  const api = new HttpdClient(baseUrl);
  const timeout = AbortSignal.timeout(8000);
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const commits = await api.repo.getActivity(id, { abort });

  return groupCommitsByWeek(commits.activity);
}
