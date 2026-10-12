import type { Review } from "@bindings/cob/patch/Review";
import type { Revision } from "@bindings/cob/patch/Revision";
import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";
import type { Comment } from "@bindings/cob/thread/Comment";
import type { Thread } from "@bindings/cob/thread/Thread";

/// Threads rooted at the comments `isRoot` picks, each with its replies oldest
/// first.
export function buildThreads<T>(
  comments: Comment<T>[],
  isRoot: (comment: Comment<T>) => boolean,
): Thread<T>[] {
  return comments.filter(isRoot).map(root => ({
    root,
    replies: comments
      .filter(c => c.replyTo === root.id)
      .sort((a, b) => a.edits[0].timestamp - b.edits[0].timestamp),
  }));
}

/// A code comment that starts a thread.
export function isCodeRoot(comment: Comment<CodeLocation>): boolean {
  return Boolean(comment.location) && !comment.replyTo;
}

/// Each review's code threads, for reviews that have any.
export function codeThreadsByReview(
  reviews: Review[],
): Map<string, Thread<CodeLocation>[]> {
  const map = new Map<string, Thread<CodeLocation>[]>();
  for (const review of reviews) {
    const threads = buildThreads(review.comments ?? [], isCodeRoot);
    if (threads.length > 0) map.set(review.id, threads);
  }
  return map;
}

/// Comments on a review itself rather than on a line. The summary is a field,
/// not the root of this thread, so a comment replying to the review id starts
/// a thread of its own.
export function reviewDiscussionThreads(
  review: Review,
): Thread<CodeLocation>[] {
  return buildThreads(
    review.comments ?? [],
    c => (!c.location && !c.replyTo) || c.replyTo === review.id,
  );
}

/// Each review's discussion threads, for reviews that have any.
export function discussionThreadsByReview(
  reviews: Review[],
): Map<string, Thread<CodeLocation>[]> {
  const map = new Map<string, Thread<CodeLocation>[]>();
  for (const review of reviews) {
    const threads = reviewDiscussionThreads(review);
    if (threads.length > 0) map.set(review.id, threads);
  }
  return map;
}

/// Which review each comment in these threads belongs to.
export function reviewIdByComment(
  ...sources: Map<string, Thread<CodeLocation>[]>[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const source of sources) {
    for (const [reviewId, threads] of source) {
      for (const thread of threads) {
        map.set(thread.root.id, reviewId);
        for (const reply of thread.replies) map.set(reply.id, reviewId);
      }
    }
  }
  return map;
}

/// Which revision each discussion comment was left on.
export function revisionIdByComment(
  revisions: Revision[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const revision of revisions) {
    for (const comment of revision.discussion ?? []) {
      map.set(comment.id, revision.id);
    }
  }
  return map;
}

/// One group per file, in order of first appearance, so a file's threads
/// render under a single header.
export function groupThreadsByFile(
  threads: Thread<CodeLocation>[],
): { path: string; threads: Thread<CodeLocation>[] }[] {
  const groups = new Map<string, Thread<CodeLocation>[]>();
  for (const thread of threads) {
    const path = thread.root.location?.path;
    if (!path) continue;
    const group = groups.get(path) ?? [];
    group.push(thread);
    groups.set(path, group);
  }
  return [...groups.entries()].map(([path, threads]) => ({ path, threads }));
}

/// The discussion threads of every revision, for the activity timeline.
///
/// Code comments render on the diff instead. A comment whose body repeats one
/// of its author's review summaries is left out too, since the review already
/// shows that text.
export function revisionDiscussionThreads(
  revisions: Revision[],
): Thread<CodeLocation>[] {
  const summaries = new Set(
    revisions
      .flatMap(r => r.reviews ?? [])
      .filter(r => r.summary && r.summary.trim() !== "")
      .map(r => `${r.author.did} ${r.summary}`),
  );
  return revisions.flatMap(revision =>
    buildThreads(revision.discussion ?? [], comment => {
      const body = comment.edits[comment.edits.length - 1]?.body ?? "";
      return (
        ((comment.id !== revision.id && !comment.replyTo) ||
          comment.replyTo === revision.id) &&
        !comment.location &&
        !summaries.has(`${comment.author.did} ${body}`)
      );
    }),
  );
}
