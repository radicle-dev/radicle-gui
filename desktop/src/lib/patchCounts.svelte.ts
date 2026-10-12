import type { PatchStatus } from "@app/views/repo/router";
import type { ProjectPayload } from "@bindings/repo/ProjectPayload";

import sum from "lodash/sum";

export const patchCounts = $state<
  Record<PatchStatus | "all", { sidebar: number | null; total: number | null }>
>({
  draft: { sidebar: null, total: null },
  open: { sidebar: null, total: null },
  archived: { sidebar: null, total: null },
  merged: { sidebar: null, total: null },
  all: { sidebar: null, total: null },
});

export function patchCountMismatch(status?: PatchStatus) {
  return (
    patchCounts[status || "all"].total !== patchCounts[status || "all"].sidebar
  );
}

export function resetPatchCounts() {
  Object.values(patchCounts).forEach(count => {
    count.sidebar = null;
    count.total = null;
  });
}

export function updatePatchCounts(
  itemCount: number,
  sidebarCount: ProjectPayload["meta"]["patches"],
  status?: PatchStatus,
) {
  if (status) {
    patchCounts[status].total = itemCount;
    patchCounts[status].sidebar = sidebarCount[status];
  } else {
    patchCounts["all"].total = itemCount;
    patchCounts["all"].sidebar = sum(Object.values(sidebarCount));
  }
}
