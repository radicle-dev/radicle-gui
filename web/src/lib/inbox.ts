import type { InboxItem } from "@app/node/node.svelte";

import { node } from "@app/node/node.svelte";

// The spot on the target page a notification points at, so it can be
// highlighted on arrival. Notifications about a whole issue or patch point at
// the page itself, which needs no highlight.
export function inboxAnchor(item: InboxItem): string | undefined {
  switch (item.kind) {
    case "issue.comment":
    case "patch.comment":
    case "mention":
      return `c-${item.id}`;
    case "patch.review":
      return `review-${item.id}`;
    case "patch.revision":
      return `revision-${item.id.replace(/:rev$/, "")}`;
    case "org.proposal":
      return `proposal-${item.id}`;
    case "identity":
      return `revision-${item.id}`;
    default:
      return undefined;
  }
}

export function inboxHref(item: InboxItem): string {
  const repo = item.rid ? node.world.repos[item.rid] : undefined;
  const org = item.org ? node.org(item.org) : undefined;
  const anchor = inboxAnchor(item);
  const hash = anchor ? `#${anchor}` : "";
  if (repo && item.target) {
    return `${node.repoPath(repo)}/${item.target.kind === "issue" ? "issues" : "patches"}/${item.target.id}${hash}`;
  }
  if (repo && item.kind === "identity") return `${node.repoPath(repo)}/identity${hash}`;
  if (org) return `/${org.handle}?tab=approvals${hash}`;
  return "/";
}
