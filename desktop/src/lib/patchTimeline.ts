import type { Author } from "@bindings/cob/Author";
import type { Operation } from "@bindings/cob/Operation";
import type { Action } from "@bindings/cob/patch/Action";
import type { Revision } from "@bindings/cob/patch/Revision";
import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";
import type { Thread } from "@bindings/cob/thread/Thread";
import type { Commit } from "@bindings/repo/Commit";

import type { ActivityItem, FlattenedAction } from "@app/lib/cobActivity";
import { flattenActivity } from "@app/lib/cobActivity";

export type FlattenedPatchOperation = FlattenedAction<Action>;

export type PatchActivityData =
  | {
      kind: "op";
      op: FlattenedPatchOperation;
      commits?: Commit[];
      reviewThreads?: Thread<CodeLocation>[];
      reviewComments?: Thread<CodeLocation>[];
    }
  | {
      kind: "opened";
      op: FlattenedPatchOperation & { type: "revision" };
      openedAsDraft: boolean;
    }
  | {
      kind: "olderRevisions";
      groupKey: string;
      revisionIds: string[];
      count: number;
      author?: Author;
      expanded: boolean;
    };

// Shown elsewhere in the patch view, or folded into the entry they change.
const skip = new Set<Action["type"]>([
  "revision.comment",
  "revision.comment.edit",
  "revision.comment.redact",
  "revision.comment.react",
  "revision.react",
  "revision.edit",
  "revision.redact",
  "review.comment",
  "review.comment.edit",
  "review.comment.redact",
  "review.comment.react",
  "review.comment.resolve",
  "review.comment.unresolve",
  "review.edit",
  "review.redact",
  "review.react",
]);

// The patch was opened as a draft when its first lifecycle change is a draft
// happening right at creation (the first or second operation), as opposed to
// being converted to draft later in its life.
export function openingDraftOpId(
  activity: Operation<Action>[],
): string | undefined {
  const ops = [...activity].sort((a, b) => a.timestamp - b.timestamp);
  const firstLifecycleIdx = ops.findIndex(op =>
    op.actions.some(a => a.type === "lifecycle"),
  );
  if (firstLifecycleIdx === -1 || firstLifecycleIdx > 1) return undefined;
  const op = ops[firstLifecycleIdx];
  const lifecycle = op.actions.find(a => a.type === "lifecycle");
  return lifecycle?.type === "lifecycle" && lifecycle.state.status === "draft"
    ? op.id
    : undefined;
}

export interface PatchTimelineInput {
  activity: Operation<Action>[];
  /// In timeline order.
  revisions: Revision[];
  commitsByRevision: Record<string, Commit[]>;
  threadsByReview: Map<string, Thread<CodeLocation>[]>;
  discussionThreadsByReview: Map<string, Thread<CodeLocation>[]>;
  /// Which folded runs of older revisions the reader expanded, by group key.
  expandedRevisionRuns: Record<string, boolean>;
}

/// The patch's activity timeline, built from its operation log.
export function patchTimeline({
  activity,
  revisions,
  commitsByRevision,
  threadsByReview,
  discussionThreadsByReview,
  expandedRevisionRuns,
}: PatchTimelineInput): ActivityItem<PatchActivityData>[] {
  const latestRevisionId = revisions.at(-1)?.id;
  const firstRevisionId = revisions[0]?.id;
  const olderRevisionIds = new Set(
    revisions.filter(r => r.id !== latestRevisionId).map(r => r.id),
  );
  const draftOpId = openingDraftOpId(activity);

  const reviewOpsByReviewId = new Map<
    string,
    FlattenedPatchOperation & { type: "review" }
  >();
  const revisionOpsByRevisionId = new Map<
    string,
    FlattenedPatchOperation & { type: "revision" }
  >();
  const redactedRevisionIds = new Set<string>();
  const redactedReviewIds = new Set<string>();

  const flattened = flattenActivity(activity, {
    skip,
    onSkipped: action => {
      if (action.type === "review.edit") {
        const reviewOp = reviewOpsByReviewId.get(action.review);
        if (reviewOp) {
          if ("verdict" in action) reviewOp.verdict = action.verdict;
          if ("summary" in action) reviewOp.summary = action.summary;
          if ("labels" in action) reviewOp.labels = action.labels;
        }
      } else if (action.type === "revision.edit") {
        const revisionOp = revisionOpsByRevisionId.get(action.revision);
        if (revisionOp) {
          revisionOp.description = action.description;
        }
      } else if (action.type === "revision.redact") {
        redactedRevisionIds.add(action.revision);
      } else if (action.type === "review.redact") {
        redactedReviewIds.add(action.review);
      }
    },
    onKept: op => {
      if (op.type === "review") {
        reviewOpsByReviewId.set(op.id, op);
      } else if (op.type === "revision") {
        revisionOpsByRevisionId.set(op.id, op);
      }
    },
  });

  const items: ActivityItem<PatchActivityData>[] = flattened.map(item => {
    const op = item.data;
    return {
      key: item.key,
      timestamp: item.timestamp,
      data: {
        kind: "op",
        op,
        commits: op.type === "revision" ? commitsByRevision[op.id] : undefined,
        reviewThreads:
          op.type === "review" ? threadsByReview.get(op.id) : undefined,
        reviewComments:
          op.type === "review"
            ? discussionThreadsByReview.get(op.id)
            : undefined,
      },
      // A merge draws a filled band and a review draws a card; both need
      // the space around them that a run of bare rows deliberately drops.
      standalone: op.type === "merge" || op.type === "review",
    };
  });

  const filtered = items.filter(item => {
    if (item.data.kind !== "op") return true;
    if (
      item.data.op.type === "revision" &&
      redactedRevisionIds.has(item.data.op.id)
    ) {
      return false;
    }
    if (
      item.data.op.type === "review" &&
      redactedReviewIds.has(item.data.op.id)
    ) {
      return false;
    }
    // The opening-draft lifecycle is folded into the "opened a draft patch"
    // label on the first revision, so drop the standalone item.
    if (
      item.data.op.type === "lifecycle" &&
      item.data.op.state.status === "draft" &&
      item.data.op.id === draftOpId
    ) {
      return false;
    }
    return true;
  });
  filtered.sort((a, b) => a.timestamp - b.timestamp);

  // Place each review immediately after the revision it belongs to, so it
  // reads as the next timeline item under that revision rather than floating
  // wherever its own timestamp lands.
  const reviewsByRevision = new Map<
    string,
    ActivityItem<PatchActivityData>[]
  >();
  for (const item of filtered) {
    if (item.data.kind === "op" && item.data.op.type === "review") {
      const revId = item.data.op.revision;
      const list = reviewsByRevision.get(revId) ?? [];
      list.push(item);
      reviewsByRevision.set(revId, list);
    }
  }
  const reordered: ActivityItem<PatchActivityData>[] = [];
  const placedReviews = new Set<string>();
  for (const item of filtered) {
    if (item.data.kind === "op" && item.data.op.type === "review") continue;
    reordered.push(item);
    if (item.data.kind === "op" && item.data.op.type === "revision") {
      const reviews = reviewsByRevision.get(item.data.op.id);
      if (reviews) {
        reordered.push(...reviews);
        reviews.forEach(r => placedReviews.add(r.key));
      }
    }
  }
  // Reviews whose revision is gone (e.g. redacted) keep their original order.
  for (const item of filtered) {
    if (
      item.data.kind === "op" &&
      item.data.op.type === "review" &&
      !placedReviews.has(item.key)
    ) {
      reordered.push(item);
    }
  }
  items.length = 0;
  items.push(...reordered);

  // The patch creation is shown as a standalone "opened patch" marker; the
  // first revision itself stays in the timeline below (and folds with other
  // revisions). Synthesize the marker from the first revision operation.
  const firstRevisionOp = revisionOpsByRevisionId.get(firstRevisionId);
  const opened: ActivityItem<PatchActivityData>[] = firstRevisionOp
    ? [
        {
          key: `opened:${firstRevisionId}`,
          timestamp: firstRevisionOp.timestamp,
          data: {
            kind: "opened",
            op: firstRevisionOp,
            openedAsDraft: draftOpId !== undefined,
          },
        },
      ]
    : [];

  const isOlderRevisionItem = (item: ActivityItem<PatchActivityData>) =>
    item.data.kind === "op" &&
    item.data.op.type === "revision" &&
    olderRevisionIds.has(item.data.op.id);
  // A review belonging to an older revision folds together with that revision.
  const isFoldableReview = (item: ActivityItem<PatchActivityData>) =>
    item.data.kind === "op" &&
    item.data.op.type === "review" &&
    olderRevisionIds.has(item.data.op.revision);
  const isFoldable = (item: ActivityItem<PatchActivityData>) =>
    isOlderRevisionItem(item) || isFoldableReview(item);
  const itemOpAuthorDid = (item: ActivityItem<PatchActivityData>) =>
    item.data.kind === "op" ? item.data.op.author.did : undefined;

  // Fold each maximal run of *consecutive* older revisions by the *same
  // author* (and the reviews nested under them) into one "<author> created N
  // revisions" toggle. A lifecycle change, comment, or a switch to another
  // author breaks the run, so a fold is always attributed to one person.
  const folded: ActivityItem<PatchActivityData>[] = [];
  let i = 0;
  while (i < items.length) {
    if (!isFoldable(items[i])) {
      folded.push(items[i]);
      i += 1;
      continue;
    }
    let j = i;
    const runAuthorDid = itemOpAuthorDid(items[i]);
    while (
      j < items.length &&
      isFoldable(items[j]) &&
      itemOpAuthorDid(items[j]) === runAuthorDid
    ) {
      j += 1;
    }
    const run = items.slice(i, j);
    const revisionItems = run.filter(isOlderRevisionItem);
    if (revisionItems.length < 2) {
      // A lone older revision (with its reviews) isn't worth folding.
      folded.push(...run);
    } else {
      const head = run[0];
      const groupKey = `older:${head.data.kind === "op" ? head.data.op.id : head.key}`;
      const runExpanded = expandedRevisionRuns[groupKey] ?? false;
      const revisionIds = revisionItems
        .map(item => (item.data.kind === "op" ? item.data.op.id : undefined))
        .filter((id): id is string => id !== undefined);
      // Only attribute the fold to an author when every folded revision is by
      // the same person; a mixed-author run stays unattributed so it isn't
      // wrongly labelled "<first author> created N revisions".
      const runAuthors = revisionItems
        .map(item =>
          item.data.kind === "op" ? item.data.op.author : undefined,
        )
        .filter((a): a is Author => a !== undefined);
      const uniqueDids = new Set(runAuthors.map(a => a.did));
      const commonAuthor = uniqueDids.size === 1 ? runAuthors[0] : undefined;
      folded.push({
        key: groupKey,
        timestamp: head.timestamp,
        data: {
          kind: "olderRevisions",
          groupKey,
          revisionIds,
          count: revisionItems.length,
          author: commonAuthor,
          expanded: runExpanded,
        },
      });
      if (runExpanded) {
        folded.push(...run);
      }
    }
    i = j;
  }
  return [...opened, ...folded];
}
