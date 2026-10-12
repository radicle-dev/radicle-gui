import type { State } from "@bindings/identity/State";

import { formatOid } from "@app/lib/utils";

const icons = {
  active: "hourglass",
  accepted: "checkmark",
  rejected: "close",
} as const;

const labels = {
  active: "Active",
  accepted: "Accepted",
  rejected: "Rejected",
};

export function stateIcon(state: State): (typeof icons)[State["status"]] {
  return icons[state.status];
}

export function stateLabel(state: State): string {
  return labels[state.status];
}

export function stateCaption(state: State): string | undefined {
  if (state.status === "rejected") {
    if (state.reason.type === "vote") return "Rejected by delegate votes";
    if (state.reason.type === "parent")
      return "Rejected because its parent revision was rejected";
    return `Rejected because sibling ${formatOid(state.reason.revision)} was accepted`;
  }
  return undefined;
}
