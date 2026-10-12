import type { NotificationItem } from "@bindings/cob/inbox/NotificationItem";
import type { NotificationsByRepo } from "@bindings/cob/inbox/NotificationsByRepo";

import fuzzysort from "fuzzysort";

export type FilteredRepo = {
  repo: NotificationsByRepo;
  groups: NotificationItem[][];
  count: number;
};

type SearchableGroup = {
  group: NotificationItem[];
  title: string;
  state: string;
  type: string;
  aliases: string;
  dids: string;
  id: string;
};

function toSearchable(group: NotificationItem[]): SearchableGroup {
  const last = group.at(-1);
  const aliases: string[] = [];
  const dids: string[] = [];
  for (const item of group) {
    for (const action of item.actions) {
      if (action.author.alias && !aliases.includes(action.author.alias)) {
        aliases.push(action.author.alias);
      }
      if (!dids.includes(action.author.did)) {
        dids.push(action.author.did);
      }
    }
  }
  return {
    group,
    title: last && "title" in last ? last.title : "",
    state: last?.status.status ?? "",
    type: group[0]?.type ?? "",
    aliases: aliases.join(" "),
    dids: dids.join(" "),
    id: group[0]?.id ?? "",
  };
}

function itemCountOf(groups: NotificationItem[][]): number {
  return groups.reduce((acc, g) => acc + g.length, 0);
}

export function rowIdsOf(groups: NotificationItem[][]): string[] {
  return groups.flatMap(g => g.map(item => item.rowId));
}

export function filterNotifications(
  repos: NotificationsByRepo[],
  query: string,
  excludedGroupIds: string[] = [],
): FilteredRepo[] {
  if (query.trim() === "") {
    return repos.map(repo => ({
      repo,
      groups: repo.notifications,
      count: repo.count,
    }));
  }
  const result: FilteredRepo[] = [];
  for (const repo of repos) {
    const searchable = repo.notifications.map(toSearchable);
    const matched = fuzzysort
      .go(query, searchable, {
        keys: ["title", "state", "type", "aliases", "dids", "id"],
        threshold: 0.5,
        all: false,
      })
      .map(r => r.obj.group)
      .filter(g => !excludedGroupIds.includes(g[0]?.id ?? ""));
    if (matched.length > 0) {
      result.push({ repo, groups: matched, count: itemCountOf(matched) });
    }
  }
  return result;
}
