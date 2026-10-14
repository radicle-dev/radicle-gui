import type { Action as IssueAction } from "@bindings/cob/issue/Action";
import type { Issue } from "@bindings/cob/issue/Issue";
import type { Operation } from "@bindings/cob/Operation";
import type { Action as PatchAction } from "@bindings/cob/patch/Action";
import type { Patch } from "@bindings/cob/patch/Patch";
import type { Revision } from "@bindings/cob/patch/Revision";
import type { Thread } from "@bindings/cob/thread/Thread";
import type { RepoInfo } from "@bindings/repo/RepoInfo";

import { get, writable } from "svelte/store";

import { invoke } from "@app/lib/invoke";
import type { Route } from "@app/lib/router";
import { activeRouteStore, push } from "@app/lib/router";

export interface IssueSheetData {
  kind: "issue";
  repo: RepoInfo;
  issue: Issue;
  activity: Operation<IssueAction>[];
  threads: Thread[];
}

export interface PatchSheetData {
  kind: "patch";
  repo: RepoInfo;
  patch: Patch;
  revisions: Revision[];
  activity: Operation<PatchAction>[];
}

export type SheetData = IssueSheetData | PatchSheetData;

export const sheet = writable<SheetData | undefined>(undefined);

// Bumped after every change made in the sheet, so the page underneath can
// refresh what it shows.
export const sheetChanges = writable(0);

let request = 0;

export function sheetId(data: SheetData): string {
  return data.kind === "issue" ? data.issue.id : data.patch.id;
}

// Opening what is already showing closes the sheet instead. The sheet only
// appears once its contents have loaded, so it slides in complete.
async function openSheet(
  kind: SheetData["kind"],
  rid: string,
  id: string,
  load: () => Promise<SheetData>,
) {
  const current = get(sheet);
  const ticket = ++request;
  if (
    current?.kind === kind &&
    current.repo.rid === rid &&
    sheetId(current) === id
  ) {
    sheet.set(undefined);
    return;
  }
  try {
    const data = await load();
    if (ticket === request) sheet.set(data);
  } catch (error) {
    console.error(`Loading the ${kind} failed`, error);
  }
}

export function openIssueSheet(rid: string, id: string) {
  return openSheet("issue", rid, id, async () => {
    const [repo, issue, activity, threads] = await Promise.all([
      invoke<RepoInfo>("repo_by_id", { rid }),
      invoke<Issue>("issue_by_id", { rid, id }),
      invoke<Operation<IssueAction>[]>("activity_by_issue", { rid, id }),
      invoke<Thread[]>("comment_threads_by_issue_id", { rid, id }),
    ]);
    return { kind: "issue", repo, issue, activity, threads };
  });
}

export function openPatchSheet(rid: string, id: string) {
  return openSheet("patch", rid, id, async () => {
    const [repo, patch, revisions, activity] = await Promise.all([
      invoke<RepoInfo>("repo_by_id", { rid }),
      invoke<Patch>("patch_by_id", { rid, id }),
      invoke<Revision[]>("revisions_by_patch", { rid, id }),
      invoke<Operation<PatchAction>[]>("activity_by_patch", { rid, id }),
    ]);
    return { kind: "patch", repo, patch, revisions, activity };
  });
}

// Re-reads the item on show after an edit in the sheet, so the sheet's own
// chrome follows changes such as a new state.
export async function refreshSheet() {
  const current = get(sheet);
  if (!current) return;
  const rid = current.repo.rid;
  const id = sheetId(current);
  try {
    if (current.kind === "issue") {
      const issue = await invoke<Issue>("issue_by_id", { rid, id });
      if (get(sheet) === current) sheet.set({ ...current, issue });
    } else {
      const patch = await invoke<Patch>("patch_by_id", { rid, id });
      if (get(sheet) === current) sheet.set({ ...current, patch });
    }
  } catch (error) {
    console.error(`Refreshing the ${current.kind} failed`, error);
  }
}

// The row that opened the sheet keeps focus, and closing with Escape would
// otherwise show its focus ring.
export function closeSheet() {
  request++;
  sheet.set(undefined);
  const focused = document.activeElement;
  if (
    focused instanceof HTMLElement &&
    focused.closest("[data-sheet-trigger]")
  ) {
    focused.blur();
  }
}

const SHEET_PAGES = ["repo.patch", "repo.issues"];

// On a patch page or the issue list, and inside the sheet itself, a link to an
// issue opens it in the sheet. Everywhere else it navigates.
export function followIssueLink(route: Route) {
  if (
    route.resource === "repo.issue" &&
    (get(sheet) !== undefined ||
      SHEET_PAGES.includes(get(activeRouteStore).resource))
  ) {
    void openIssueSheet(route.rid, route.issue);
  } else {
    void push(route);
  }
}
