import type { NotificationsByRepo } from "@bindings/cob/inbox/NotificationsByRepo";

// The issues and patches in the open inbox, by repository. Updates to them
// refresh the statuses the inbox shows. Undefined while the inbox is closed.
let shown: ReadonlyMap<string, ReadonlySet<string>> | undefined;

export function setInboxItems(repos: NotificationsByRepo[] | undefined): void {
  shown =
    repos &&
    new Map(
      repos.map(r => [r.rid, new Set(r.notifications.flat().map(n => n.id))]),
    );
}

export function inboxOpen(): boolean {
  return shown !== undefined;
}

// Whether the open inbox shows the repository, or with `id`, that issue or
// patch of it.
export function inInbox(rid: string, id?: string): boolean {
  const ids = shown?.get(rid);
  return ids !== undefined && (id === undefined || ids.has(id));
}
