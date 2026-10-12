import type { AliasSuggestion } from "@bindings/cob/AliasSuggestion";
import type { Author } from "@bindings/cob/Author";

export interface AssigneeSuggestion {
  did: string;
  alias?: string;
  badge?: "delegate" | "following" | "you";
}

export function matchesAssignee(
  query: string,
  { did, alias }: { did: string; alias?: string },
): boolean {
  const needle = query.trim().toLowerCase();
  const key = needle.replace(/^did:key:/, "");

  return (
    did
      .replace(/^did:key:/, "")
      .toLowerCase()
      .startsWith(key) ||
    (alias?.toLowerCase().includes(needle) ?? false)
  );
}

export function rankAssigneeSuggestions({
  query,
  aliases,
  delegates,
  assignees,
  limit,
}: {
  query: string;
  aliases: AliasSuggestion[];
  delegates: Author[];
  assignees: Author[];
  limit: number;
}): AssigneeSuggestion[] {
  const assigned = new Set(assignees.map(({ did }) => did));
  const seen = new Set<string>();

  const matchingDelegates = delegates.filter(delegate =>
    matchesAssignee(query, delegate),
  );

  const rows = [...matchingDelegates, ...aliases].flatMap(author => {
    if (assigned.has(author.did) || seen.has(author.did)) return [];
    seen.add(author.did);
    const match = aliases.find(({ did }) => did === author.did);
    const badge: AssigneeSuggestion["badge"] = match?.isSelf
      ? "you"
      : delegates.some(({ did }) => did === author.did)
        ? "delegate"
        : match?.followed
          ? "following"
          : undefined;

    return [{ did: author.did, alias: author.alias, badge }];
  });

  const others = rows.filter(
    row => row.badge !== "you" && row.badge !== "delegate",
  );

  return [
    ...rows.filter(row => row.badge === "you"),
    ...rows.filter(row => row.badge === "delegate"),
    ...others.filter(row => row.alias !== undefined),
    ...others.filter(row => row.alias === undefined),
  ].slice(0, limit);
}
