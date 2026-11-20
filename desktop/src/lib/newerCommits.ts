import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";

interface CommitLike {
  id: string;
  parents: string[];
}

export type NewerCommits<T> =
  | { type: "added"; commits: T[]; merge: boolean }
  // `from` isn't among the newer commit's ancestors, so history was rewritten.
  | { type: "rewritten" };

// The commits a branch gained since `from`, newest first, fetched a page at a
// time from the new head and up to `limit` of them.
export async function newerCommits<T extends CommitLike>(
  fetchPage: (skip: number, take: number) => Promise<PaginatedQuery<T[]>>,
  from: string,
  limit: number,
  pageSize: number,
): Promise<NewerCommits<T>> {
  const added: T[] = [];
  for (let skip = 0; skip < limit; skip += pageSize) {
    const page = await fetchPage(skip, pageSize);
    const at = page.content.findIndex(commit => commit.id === from);
    if (at >= 0) {
      added.push(...page.content.slice(0, at));
      return {
        type: "added",
        commits: added,
        merge: added.some(commit => commit.parents.length > 1),
      };
    }
    added.push(...page.content);
    if (!page.more) break;
  }
  return { type: "rewritten" };
}
