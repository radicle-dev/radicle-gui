import type { Action } from "@bindings/cob/issue/Action";
import type { Issue } from "@bindings/cob/issue/Issue";
import type { Operation } from "@bindings/cob/Operation";
import type { Thread } from "@bindings/cob/thread/Thread";
import type { RepoInfo } from "@bindings/repo/RepoInfo";

import { get, writable } from "svelte/store";

import { invoke } from "@app/lib/invoke";
import type { Route } from "@app/lib/router";
import { activeRouteStore, push } from "@app/lib/router";

export interface IssueSheetData {
  repo: RepoInfo;
  issue: Issue;
  activity: Operation<Action>[];
  threads: Thread[];
}

export const issueSheet = writable<IssueSheetData | undefined>(undefined);

// Bumped after every change made in the sheet, so the page underneath can
// refresh what it shows.
export const issueSheetChanges = writable(0);

let request = 0;

export async function loadIssueSheet(
  rid: string,
  id: string,
): Promise<IssueSheetData> {
  const [repo, issue, activity, threads] = await Promise.all([
    invoke<RepoInfo>("repo_by_id", { rid }),
    invoke<Issue>("issue_by_id", { rid, id }),
    invoke<Operation<Action>[]>("activity_by_issue", { rid, id }),
    invoke<Thread[]>("comment_threads_by_issue_id", { rid, id }),
  ]);
  return { repo, issue, activity, threads };
}

// Opening the issue that is already showing closes the sheet instead. The
// sheet only appears once the issue has loaded, so it slides in complete.
export async function openIssueSheet(rid: string, id: string) {
  const current = get(issueSheet);
  const ticket = ++request;
  if (current?.repo.rid === rid && current.issue.id === id) {
    issueSheet.set(undefined);
    return;
  }
  try {
    const data = await loadIssueSheet(rid, id);
    if (ticket === request) issueSheet.set(data);
  } catch (error) {
    console.error("Loading the issue failed", error);
  }
}

export function closeIssueSheet() {
  request++;
  issueSheet.set(undefined);
}

const SHEET_PAGES = ["repo.patch", "repo.issues"];

// On a patch page or the issue list, and inside the sheet itself, a link to an
// issue opens it in the sheet. Everywhere else it navigates.
export function followIssueLink(route: Route) {
  if (
    route.resource === "repo.issue" &&
    (get(issueSheet) !== undefined ||
      SHEET_PAGES.includes(get(activeRouteStore).resource))
  ) {
    void openIssueSheet(route.rid, route.issue);
  } else {
    void push(route);
  }
}
