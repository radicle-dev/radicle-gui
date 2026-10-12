import type { Author } from "@bindings/cob/Author";
import type { Reviewer } from "@bindings/cob/patch/Reviewer";
import type { Revision } from "@bindings/cob/patch/Revision";
import type { Verdict } from "@bindings/cob/patch/Verdict";

// How a patch's reviews are summarised. Shared by the patch header and the
// patch list so the two can't drift: both count the same things, order them the
// same way and go outdated under the same rule.

/// One review, from either source: the patch header builds these from the
/// revisions it has loaded, the patch list from `Patch["reviewers"]`.
export interface ReviewEntry {
  author: Author;
  verdict?: Verdict;
  /// 1-based position of the reviewed revision in the patch timeline.
  revisionNumber: number;
  delegate: boolean;
  /// Only the header links to a specific review; the list has no popover.
  reviewId?: string;
}

export function entriesFromReviewers(reviewers: Reviewer[]): ReviewEntry[] {
  return reviewers.map(r => ({
    author: r.author,
    verdict: r.verdict,
    revisionNumber: r.revisionNumber,
    delegate: r.delegate,
  }));
}

export function entriesFromRevisions(
  revisions: Revision[],
  delegateDids: string[],
): ReviewEntry[] {
  const delegates = new Set(delegateDids);
  return revisions.flatMap((rev, index) =>
    (rev.reviews ?? []).map(review => ({
      author: review.author,
      verdict: review.verdict,
      revisionNumber: index + 1,
      delegate: delegates.has(review.author.did),
      reviewId: review.id,
    })),
  );
}

/// Grouped by author so a person's reviews stay together, newest revision first
/// within a group and across groups.
export function orderReviews(entries: ReviewEntry[]): ReviewEntry[] {
  const byAuthor = new Map<string, ReviewEntry[]>();
  for (const entry of entries) {
    const group = byAuthor.get(entry.author.did) ?? [];
    group.push(entry);
    byAuthor.set(entry.author.did, group);
  }
  return [...byAuthor.values()]
    .map(group =>
      [...group].sort((a, b) => b.revisionNumber - a.revisionNumber),
    )
    .sort((a, b) => b[0].revisionNumber - a[0].revisionNumber)
    .flat();
}

export interface ReviewSummaryState {
  reviews: ReviewEntry[];
  /// People, not reviews — the avatar stack and the "N reviewers" wording.
  /// Delegates first, so they survive the stack being truncated.
  authors: (Author & { delegate: boolean })[];
  hasReject: boolean;
  allAccept: boolean;
  /// No review covers the newest revision, so nothing here describes the
  /// changes as they now stand. The verdict colouring is suppressed in this
  /// state: a stale accept must never read as a current approval.
  outdated: boolean;
  /// Newest revision anyone has reviewed, which is what the outdated pill
  /// names ("· r1"). Zero when there are no reviews.
  latestReviewedRevision: number;
  delegateCount: number;
}

export function reviewSummary(
  entries: ReviewEntry[],
  revisionCount: number,
): ReviewSummaryState {
  const reviews = orderReviews(entries);

  const seen = new Map<string, Author & { delegate: boolean }>();
  for (const entry of reviews) {
    const existing = seen.get(entry.author.did);
    if (existing) {
      // A person is a delegate or not; if any of their reviews says so, keep it.
      existing.delegate ||= entry.delegate;
    } else {
      seen.set(entry.author.did, { ...entry.author, delegate: entry.delegate });
    }
  }
  const authors = [...seen.values()].sort(
    (a, b) => Number(b.delegate) - Number(a.delegate),
  );

  const outdated =
    reviews.length > 0 &&
    revisionCount > 0 &&
    !reviews.some(r => r.revisionNumber === revisionCount);

  return {
    reviews,
    authors,
    hasReject: !outdated && reviews.some(r => r.verdict === "reject"),
    allAccept:
      !outdated &&
      reviews.length > 0 &&
      reviews.every(r => r.verdict === "accept"),
    outdated,
    latestReviewedRevision: reviews.reduce(
      (max, r) => Math.max(max, r.revisionNumber),
      0,
    ),
    delegateCount: authors.filter(a => a.delegate).length,
  };
}

/// A review that no longer covers the current head.
export function isOutdatedReview(
  entry: ReviewEntry,
  revisionCount: number,
): boolean {
  return revisionCount > 0 && entry.revisionNumber !== revisionCount;
}

export function summaryTitle(state: ReviewSummaryState): string {
  const reviews = `${state.reviews.length} ${state.reviews.length === 1 ? "review" : "reviews"}`;
  const people = `${state.authors.length} ${state.authors.length === 1 ? "reviewer" : "reviewers"}`;
  const delegates =
    state.delegateCount > 0 ? `, ${state.delegateCount} a delegate` : "";
  const outdated = state.outdated
    ? ` — newest is of revision ${state.latestReviewedRevision}, so these may no longer apply`
    : "";
  return `${reviews} by ${people}${delegates}${outdated}`;
}
