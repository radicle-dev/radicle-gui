import type { IssueStatus } from "@app/views/repo/router";
import type { ProjectPayload } from "@bindings/repo/ProjectPayload";

export const issueCounts = $state<
  Record<IssueStatus, { sidebar: number | null; total: number | null }>
>({
  all: { sidebar: null, total: null },
  open: { sidebar: null, total: null },
  closed: { sidebar: null, total: null },
});

export function issueCountMismatch(status: IssueStatus) {
  return issueCounts[status].total !== issueCounts[status].sidebar;
}

export function resetIssueCounts() {
  Object.values(issueCounts).forEach(count => {
    count.sidebar = null;
    count.total = null;
  });
}

export function updateIssueCounts(
  itemCount: number,
  sidebarCount: ProjectPayload["meta"]["issues"] & { all: number },
  status: IssueStatus,
) {
  issueCounts[status].total = itemCount;
  issueCounts[status].sidebar = sidebarCount[status];
}
