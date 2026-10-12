<script lang="ts">
  import type { CommentOrigin } from "@app/components/Comment.svelte";
  import type { PatchView } from "@app/views/repo/router";
  import type { Author } from "@bindings/cob/Author";
  import type { Operation } from "@bindings/cob/Operation";
  import type { Action } from "@bindings/cob/patch/Action";
  import type { Patch } from "@bindings/cob/patch/Patch";
  import type { Review } from "@bindings/cob/patch/Review";
  import type { Revision } from "@bindings/cob/patch/Revision";
  import type { Verdict } from "@bindings/cob/patch/Verdict";
  import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";
  import type { Comment } from "@bindings/cob/thread/Comment";
  import type { Embed } from "@bindings/cob/thread/Embed";
  import type { Thread } from "@bindings/cob/thread/Thread";
  import type { Config } from "@bindings/config/Config";
  import type { FileDiff } from "@bindings/diff/FileDiff";

  import { untrack } from "svelte";

  import type { CommentOwner } from "@app/lib/codeCommentActions";
  import { commentActions } from "@app/lib/codeCommentActions";
  import type { CodeComments } from "@app/lib/codeComments";
  import { orderFileGroups } from "@app/lib/commentNavigation";
  import { resolutionsByComment } from "@app/lib/commentResolutions";
  import { diffOptions } from "@app/lib/diffOptions.svelte";
  import {
    fileDiffPath,
    fileMetaOf,
    fullFileLoader,
    gitStatusEntries,
  } from "@app/lib/diffText";
  import { nodeRunning } from "@app/lib/events";
  import {
    cachedGetDiff,
    cachedGetDiffText,
    getDiffText,
    invoke,
  } from "@app/lib/invoke";
  import type { CommentAnchor } from "@app/lib/pierreComments";
  import * as roles from "@app/lib/roles";
  import { push } from "@app/lib/router";
  import {
    buildThreads,
    groupThreadsByFile,
    isCodeRoot,
    reviewDiscussionThreads,
  } from "@app/lib/threads";
  import {
    absoluteTimestamp,
    authorForNodeId,
    didFromPublicKey,
    formatTimestamp,
    pluralize,
    revisionPosition,
    verdictAction,
    verdictBadge,
    verdictIcon,
  } from "@app/lib/utils";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import Button from "@app/components/Button.svelte";
  import Discussion from "@app/components/Discussion.svelte";
  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import ExtendedTextarea from "@app/components/ExtendedTextarea.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import PierreDiff from "@app/components/PierreDiff.svelte";
  import PierreTree from "@app/components/PierreTree.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import ReviewCommentList from "@app/components/ReviewCommentList.svelte";

  interface Props {
    config: Config;
    loadPatch: () => Promise<void>;
    patch: Patch;
    repoDelegates: Author[];
    review: Review;
    revisions: Revision[];
    // The patch's operation log, which is the only place that records who
    // resolved a comment (see `resolutionsByComment`).
    activity: Operation<Action>[];
    rid: string;
    status: Patch["state"]["status"] | undefined;
    // The tab this review was opened from, so leaving it returns there.
    fromView?: PatchView;
  }

  const {
    config,
    loadPatch,
    patch,
    repoDelegates,
    review,
    revisions,
    activity,
    rid,
    status,
    fromView,
  }: Props = $props();

  const isOwnPublishedReview = $derived(
    review.author.did === didFromPublicKey(config.publicKey),
  );

  let verdictPickerExpanded = $state(false);
  let savingVerdict = $state(false);
  let editingSummary = $state(false);
  let savingSummary = $state(false);
  let deleteConfirmExpanded = $state(false);
  let deleting = $state(false);

  const verdictOptions: { value: Verdict | undefined; label: string }[] = (
    [undefined, "accept", "reject"] as const
  ).map(value => ({ value, label: verdictAction(value) }));

  async function createCodeComment(
    body: string,
    embeds: Embed[],
    replyTo?: string,
    location?: CodeLocation,
  ) {
    // Commenting from inside a review joins that review, whoever authored it,
    // so the comment is resolvable and travels with the verdict. Attribution
    // stays per-comment, and the protocol allows anyone to comment on a review.
    if (!replyTo) {
      if (!location) return;
      try {
        await invoke("edit_patch", {
          rid,
          cobId: patch.id,
          action: {
            type: "review.comment",
            review: review.id,
            body,
            location,
            embeds,
          },
          opts: { announce: $nodeRunning && $announce },
        });
      } catch (error) {
        console.error("Adding comment to review failed", error);
      } finally {
        await loadPatch();
      }
      return;
    }
    // Replies follow their parent: into the review, or onto the revision when
    // replying to a standalone comment. Without a revision there is nothing to
    // attach the latter to, so don't send an action with an empty target.
    const toReview = reviewCommentIds.has(replyTo);
    if (!toReview && !reviewedRevision) return;
    try {
      await invoke("edit_patch", {
        rid,
        cobId: patch.id,
        action: toReview
          ? {
              type: "review.comment",
              review: review.id,
              body,
              replyTo,
              embeds,
            }
          : {
              type: "revision.comment",
              revision: reviewedRevision?.id,
              body,
              replyTo,
              embeds,
            },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Replying to comment failed", error);
    } finally {
      await loadPatch();
    }
  }

  async function saveSummary(newSummary: string) {
    try {
      savingSummary = true;
      await invoke("edit_patch", {
        rid,
        cobId: patch.id,
        action: {
          type: "review.edit",
          review: review.id,
          summary: newSummary,
          verdict: review.verdict,
          labels: review.labels,
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Editing review summary failed", error);
    } finally {
      savingSummary = false;
      editingSummary = false;
      await loadPatch();
    }
  }

  async function deleteReview() {
    try {
      deleting = true;
      closeFocused();
      await invoke("edit_patch", {
        rid,
        cobId: patch.id,
        action: { type: "review.redact", review: review.id },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Deleting review failed", error);
      deleting = false;
      return;
    }
    deleting = false;
    backToPatch();
    await loadPatch();
  }

  async function setVerdict(verdict: Verdict | undefined) {
    if (verdict === review.verdict) {
      closeFocused();
      return;
    }
    try {
      savingVerdict = true;
      closeFocused();
      await invoke("edit_patch", {
        rid,
        cobId: patch.id,
        action: {
          type: "review.edit",
          review: review.id,
          summary: review.summary ?? "",
          verdict,
          labels: review.labels,
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Editing review verdict failed", error);
    } finally {
      savingVerdict = false;
      await loadPatch();
    }
  }

  const commentThreads = $derived(
    reviewDiscussionThreads(review) as unknown as Thread[],
  );

  async function createDiscussionComment(
    body: string,
    embeds: Embed[],
    replyTo?: string,
  ) {
    try {
      await invoke("edit_patch", {
        rid,
        cobId: patch.id,
        action: {
          type: "review.comment",
          review: review.id,
          body,
          replyTo,
          embeds,
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Commenting on review failed", error);
    } finally {
      await loadPatch();
    }
  }

  type FileGroup = {
    path: string;
    threads: Thread<CodeLocation>[];
  };

  const reviewedRevision: Revision | undefined = $derived(
    revisions.find(r => r.reviews?.some(rev => rev.id === review.id)),
  );

  // 1-based position of the reviewed revision, so the page can say which
  // revision (of how many) this review is of.
  const reviewedRevisionNumber = $derived(
    reviewedRevision
      ? revisionPosition(revisions, reviewedRevision.id)
      : undefined,
  );

  // Ids of comments that belong to the review itself (as opposed to standalone
  // code comments left directly on the revision), so edits/replies target the
  // right action.
  const reviewCommentIds = $derived(
    new Set((review.comments as Comment<CodeLocation>[]).map(c => c.id)),
  );

  // Threads here mix this review's own comments with standalone comments on
  // the reviewed revision, so each mutation resolves its target first.
  function ownerOf(commentId: string): CommentOwner | undefined {
    if (reviewCommentIds.has(commentId)) {
      return { kind: "review", reviewId: review.id };
    }
    if (reviewedRevision) {
      return { kind: "revision", revisionId: reviewedRevision.id };
    }
    return undefined;
  }

  // The protocol lets the comment author, the review author or the revision
  // author resolve a review comment; delegates may do anything. Standalone
  // revision comments have no resolve action at all.
  function canResolveComment(commentId: string): boolean {
    if (ownerOf(commentId)?.kind !== "review") return false;
    return roles.canResolveReviewComment(
      config.publicKey,
      repoDelegates.map(d => d.did),
      {
        comment: (review.comments ?? []).find(c => c.id === commentId)?.author
          .did,
        review: review.author.did,
        revision: reviewedRevision?.author.did,
      },
    );
  }

  const codeActions = $derived(
    commentActions({
      rid,
      patchId: patch.id,
      publicKey: config.publicKey,
      announce: $nodeRunning && $announce,
      ownerOf,
      reload: loadPatch,
    }),
  );

  // Standalone code comments left directly on the reviewed revision (not part
  // of the review itself) also belong on this page.
  const fileGroups: FileGroup[] = $derived(
    groupThreadsByFile([
      ...buildThreads(
        review.comments as Comment<CodeLocation>[],
        c => isCodeRoot(c) && c.id !== review.id,
      ),
      ...(reviewedRevision
        ? buildThreads(
            reviewedRevision.discussion ?? [],
            c => isCodeRoot(c) && c.id !== reviewedRevision.id,
          )
        : []),
    ]),
  );

  // Standalone comments render next to the review's own and look identical,
  // but nothing can resolve them and their edits target the revision, so they
  // say where they live.
  const threadOrigins: Record<string, CommentOrigin> = $derived.by(() => {
    const origins: Record<string, CommentOrigin> = {};
    for (const group of fileGroups) {
      for (const thread of group.threads) {
        if (reviewCommentIds.has(thread.root.id)) continue;
        origins[thread.root.id] = {
          text: "on the revision",
          title: "Left directly on the revision, not part of this review",
        };
      }
    }
    return origins;
  });

  // The files this review says something about. The diff below is restricted to
  // these: a review is a record of what someone had to say, and a file they said
  // nothing about is context they can already read on the Changes tab.

  const commentedPaths = $derived(new Set(fileGroups.map(g => g.path)));
  // A review with no line comments has nothing for the columns or the bar over
  // them to be about: what is left is the summary, the discussion and a note
  // saying so. It also means the file filter is out of reach there, which is the
  // trade for not framing an empty page.
  const hasLineComments = $derived(commentedPaths.size > 0);
  const lineCommentThreads = $derived(fileGroups.flatMap(g => g.threads));
  const resolvedLineComments = $derived(
    lineCommentThreads.filter(thread => thread.root.resolved === true).length,
  );

  const resolutions = $derived(resolutionsByComment(activity));
  function resolvedBy(commentId: string) {
    return resolutions.get(commentId);
  }

  const reviewCodeComments: CodeComments = $derived({
    config,
    repoDelegates,
    rid,
    threads: fileGroups.flatMap(g => g.threads),
    threadOrigins,
    canReply: true,
    hideThreadFileHeader: true,
    createComment: createCodeComment,
    editComment: codeActions.editComment,
    deleteComment: codeActions.deleteComment,
    changeCommentStatus: codeActions.changeCommentStatus,
    canResolveComment,
    resolvedBy,
    reactOnComment: codeActions.reactOnComment,
  });

  // Both halves of the reviewed revision's diff, loaded together and published
  // in one go: Pierre renders from the patch text, while the structured diff
  // supplies the per-file status and the binary/empty marks it cannot derive
  // from a hunk-less file.
  //
  // `key` doubles as Pierre's `cacheKey` prefix, so it has to be published in
  // the same update as the text it belongs to: keying the shared highlight cache
  // by file path alone collides across diffs and renders files blank.
  let loadedDiff = $state.raw<
    { key: string; text: string; files: FileDiff[] } | undefined
  >();
  $effect(() => {
    const rev = reviewedRevision;
    if (!rev) return;
    const ridLocal = rid;
    const key = `${rev.base}-${rev.head}`;
    if (untrack(() => loadedDiff?.key) === key) return;
    let cancelled = false;
    void Promise.all([
      cachedGetDiffText(ridLocal, rev.base, rev.head, 3),
      cachedGetDiff(ridLocal, {
        base: rev.base,
        head: rev.head,
      }),
    ])
      .then(([text, diff]) => {
        if (cancelled) return;
        loadedDiff = { key, text, files: diff.files };
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(
          `ReviewPage: failed to load the diff for ${rev.base}..${rev.head}`,
          error,
        );
      });
    return () => {
      cancelled = true;
    };
  });

  const diffFiles = $derived(loadedDiff?.files ?? []);
  const fileMeta = $derived(fileMetaOf(diffFiles));
  const loadFullFile = $derived(
    fullFileLoader(
      rid,
      reviewedRevision?.base,
      reviewedRevision?.head ?? "",
      () => diffFiles,
    ),
  );

  let diffView = $state<ReturnType<typeof PierreDiff> | undefined>();

  // Shared by the comment column and the left half of the sticky bar above it,
  // so the bar's divider lands on the column's edge.
  const commentColumnWidth = "19rem";

  let filesExpanded = $state(true);
  // The column is a way around the review, not part of reading it, so it can be
  // put away to give the diff the full width.
  let sideColumnShown = $state(true);
  // What that column shows: the review's comments, or the files it touches.
  let sideColumnMode = $state<"comments" | "tree">("comments");
  // A review is about the lines it comments on, so those files are what the diff
  // shows by default; the rest of the revision is a click away for the context it
  // does not mention.
  let onlyCommentedFiles = $state(true);

  // Left unset to show the whole revision — `PierreDiff` reads no filter at all
  // as "every file".
  const visiblePaths = $derived(
    onlyCommentedFiles ? commentedPaths : undefined,
  );
  // The tree lists exactly what the diff is showing, in the diff's own order.
  const treeFiles = $derived(
    gitStatusEntries(diffFiles).filter(
      entry => visiblePaths === undefined || visiblePaths.has(entry.path),
    ),
  );
  function setAllFilesCollapsed(collapsed: boolean) {
    filesExpanded = !collapsed;
    diffView?.setAllCollapsed(collapsed);
  }

  // The comment the sidebar last jumped to, marked at both ends — the row that
  // was clicked and the comment it points at. Held long enough to be noticed and
  // then dropped, so neither keeps a stale mark on it.
  let highlightedCommentId = $state<string | undefined>(undefined);
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;

  function revealComment(commentId: string, anchor: CommentAnchor | undefined) {
    clearTimeout(highlightTimer);
    highlightedCommentId = commentId;
    diffView?.scrollToAnchor(anchor);
    highlightTimer = setTimeout(() => {
      highlightedCommentId = undefined;
    }, 2400);
  }
  // Leaving the page inside that window would otherwise fire the timer against a
  // component that is gone.
  $effect(() => () => clearTimeout(highlightTimer));

  // The sidebar reads top to bottom alongside the file column, so the files come
  // in diff order and each file's threads in line order. `fileGroups` is built
  // from the review's comments, which are in neither.
  const orderedGroups = $derived(
    orderFileGroups(fileGroups, diffFiles.map(fileDiffPath)),
  );

  const verdict = $derived(review.verdict);
  const timestamp = $derived(review.timestamp);
  const summary = $derived(review.summary?.trim() ?? "");
  const backCaption = $derived(
    fromView === "changes" ? "Back to changes" : "Back to activity",
  );

  function backToPatch() {
    void push({
      resource: "repo.patch",
      rid,
      patch: patch.id,
      status,
      reviewId: undefined,
      view: fromView === "changes" ? "changes" : undefined,
    });
  }
</script>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .back {
    background-color: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    padding: 0.375rem 0.625rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    color: var(--color-text-secondary);
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font: var(--txt-body-m-regular);
  }
  .back:hover,
  .back:focus-visible {
    color: var(--color-text-primary);
    background-color: var(--color-surface-subtle);
  }
  .meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    color: var(--color-text-secondary);
    font: var(--txt-body-m-regular);
  }
  .meta :global(*) {
    font: inherit;
  }
  .verdict-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.125rem 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    /* Inherit the meta text colour; without this the <button> variant falls
       back to the UA `ButtonText` system colour, which is unreadable on the
       dark surface. */
    color: inherit;
    font: inherit;
  }
  .verdict-chip.accept {
    background-color: var(--color-feedback-success-bg);
    border-color: transparent;
    color: var(--color-feedback-success-text);
  }
  .verdict-chip.reject {
    background-color: var(--color-feedback-error-bg);
    border-color: transparent;
    color: var(--color-feedback-error-text);
  }
  .summary {
    position: relative;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    /* Matches the reply box and `Comment`'s own body inset, so the summary text
       and the comment placeholder start on the same line. */
    padding: 0.75rem;
    font: var(--txt-body-m-regular);
  }
  .summary-empty {
    color: var(--color-text-tertiary);
  }
  .summary-edit {
    position: absolute;
    top: 0.375rem;
    right: 0.375rem;
    opacity: 0;
    transition: opacity 150ms ease;
  }
  .summary:hover .summary-edit,
  .summary:focus-within .summary-edit,
  .summary-edit:focus-visible {
    opacity: 1;
  }

  .action-icon {
    background: none;
    border: 1px solid transparent;
    cursor: pointer;
    color: var(--color-text-tertiary);
    padding: 0.25rem;
    border-radius: var(--border-radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .action-icon:hover:not(:disabled),
  .action-icon:focus-visible {
    color: var(--color-text-primary);
    background-color: var(--color-surface-subtle);
  }
  .action-icon:disabled {
    cursor: progress;
    opacity: 0.6;
  }
  .delete-confirm {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background-color: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    max-width: 20rem;
  }
  .delete-confirm-message {
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .delete-confirm-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .delete-confirm-button {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    background-color: var(--color-feedback-error-bg);
    color: var(--color-feedback-error-text);
    border: 1px solid var(--color-feedback-error-text);
    border-radius: var(--border-radius-sm);
    padding: 0.25rem 0.75rem;
    cursor: pointer;
    font: var(--txt-body-m-medium);
  }
  .delete-confirm-button:hover:not(:disabled),
  .delete-confirm-button:focus-visible {
    background-color: var(--color-feedback-error-text);
    color: var(--color-surface-canvas);
  }
  .delete-confirm-button:disabled {
    cursor: progress;
    opacity: 0.6;
  }
  /* The chrome is full width inside the diff's scroll content, so it carries
     its own horizontal padding — the same as the patch view's own header. */
  /* One rhythm for the whole review header: every block below is a direct child
     and carries no vertical margin of its own, so the spacing stays even
     whichever blocks a given review actually has. */
  .chrome {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    /* The bottom padding is the same step as the gap: it is what separates the
       last block from the first file, now that nothing in here carries a margin
       of its own. */
    padding: 1rem 1rem 1.5rem;
  }
  /* Where the file list would be. Without it the page just stops after the
     discussion, which reads as something having failed to load. Indented past
     the cards' border to start on the same line as the text inside them, rather
     than level with their edges. */
  /* Frames the scroll port itself, so the header inside it pins to a border that
     does not move — the same arrangement as the commits column. */
  /* A definite height, handed down by the diff: the column has to scroll on its
     own once it outgrows the port, and a percentage here resolves against an
     indefinite box and is dropped. */
  .side-column {
    max-height: var(--app-diff-overlay-height, 100%);
    overflow-y: auto;
    /* An outset ring, not a border: the file cards beside it are outlined the
       same way, and a real border would sit inside the box and leave the two a
       pixel out of line. */
    box-shadow: 0 0 0 1px var(--color-border-subtle);
    /* Square at the top, where the header in the sticky bar above continues it. */
    border-radius: 0 0 var(--border-radius-md) var(--border-radius-md);
  }
  /* The tree scrolls inside itself and stretches to fill the column, so it needs
     a height rather than a cap — and no scrolling of its own out here. */
  .side-column.tree {
    height: var(--app-diff-overlay-height, 100%);
    overflow: hidden;
    padding: 0.5rem 0;
    background-color: var(--color-surface-canvas);
  }
  .no-line-comments {
    /* Just short of where the cards' text starts (their border plus padding).
       Optically that reads as aligned: this line has no box around it, so the
       mathematical offset looks a touch too far right. */
    padding-left: 0.75rem;
    color: var(--color-text-tertiary);
  }
  .timestamp {
    color: var(--color-text-quaternary);
  }
  .verdict-toggle {
    cursor: pointer;
    font: inherit;
  }
  .verdict-toggle:not(.accept):not(.reject):hover,
  .verdict-toggle:not(.accept):not(.reject):focus-visible {
    background-color: var(--color-surface-subtle);
  }
  .verdict-toggle.accept:hover,
  .verdict-toggle.accept:focus-visible,
  .verdict-toggle.reject:hover,
  .verdict-toggle.reject:focus-visible {
    filter: brightness(0.97);
  }
  .verdict-toggle:disabled {
    cursor: progress;
    opacity: 0.6;
  }
  .verdict-accept {
    color: var(--color-feedback-success-text);
  }
  .verdict-reject {
    color: var(--color-feedback-error-text);
  }
  /* The row above both columns. No rule of its own: the only thing drawn in it
     is the comment column's header, so past that header it is empty space with
     the controls floating at its right. Opaque, since the diff scrolls under it. */
  .sticky-bar {
    display: flex;
    align-items: center;
    /* The one gap in the row is the one between the two columns, which is what
       separates the comment column's header from the file column's first
       control. */
    gap: 0.5rem;
    height: 2.5rem;
    background-color: var(--color-surface-canvas);
  }
  /* The comment column's heading, which is what it was before it moved up here —
     same height, padding and weight, and outlined like the column so the two read
     as one box that happens to be split across a sticky boundary. Rounded at the
     top only; the column drops its own top corners to meet it.

     The outline is an outset ring, as everything else in this layout is: the
     column below is offset by exactly one pixel (see `--app-sticky-gap`), which
     is the row this ring's underside occupies, so the two coincide into the one
     line that divides the header from the list. */
  .sticky-bar-summary {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    align-self: stretch;
    padding: 0 0.5rem;
    border-radius: var(--border-radius-md) var(--border-radius-md) 0 0;
    box-shadow: 0 0 0 1px var(--color-border-subtle);
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .sticky-bar-summary .icon {
    display: grid;
    width: 1rem;
    height: 1rem;
    place-items: center;
  }
  /* Joined, so the pair reads as one control with one of its two sides on — the
     same borderless switch the diff settings popover uses for its pairs. */
  .sticky-bar-modes {
    display: flex;
    align-items: center;
  }
  .sticky-bar-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    padding-left: 0.5rem;
  }
</style>

{#snippet chrome()}
  <div class="chrome">
    <div class="header">
      <button
        type="button"
        class="back"
        onclick={backToPatch}
        title={backCaption}>
        <Icon name="arrow-left" />
        {backCaption}
      </button>
    </div>

    <div class="meta">
      <NodeId {...authorForNodeId(review.author)} />
      {#if isOwnPublishedReview}
        {@const verdictLabel = verdictBadge(verdict).label}
        <Popover
          popoverPadding="0"
          placement="bottom-start"
          bind:expanded={verdictPickerExpanded}>
          {#snippet toggle(onclick)}
            <button
              type="button"
              class="verdict-chip verdict-toggle"
              class:accept={verdict === "accept"}
              class:reject={verdict === "reject"}
              aria-haspopup="menu"
              aria-expanded={verdictPickerExpanded}
              disabled={savingVerdict}
              {onclick}>
              <Icon name={verdictIcon(verdict)} />
              {verdictLabel}
              <Icon
                name={verdictPickerExpanded ? "chevron-up" : "chevron-down"} />
            </button>
          {/snippet}
          {#snippet popover()}
            <div
              style:border="1px solid var(--color-border-subtle)"
              style:border-radius="var(--border-radius-sm)"
              style:background-color="var(--color-surface-canvas)"
              style:min-width="10rem">
              <DropdownList items={verdictOptions}>
                {#snippet item(option)}
                  {@const disabled =
                    option.value === undefined && summary === ""}
                  <DropdownListItem
                    selected={verdict === option.value}
                    {disabled}
                    title={disabled
                      ? "Add a summary before switching to Comment"
                      : undefined}
                    styleGap="0.5rem"
                    onclick={() => setVerdict(option.value)}>
                    <span
                      class:verdict-accept={option.value === "accept"}
                      class:verdict-reject={option.value === "reject"}>
                      <Icon name={verdictIcon(option.value)} />
                    </span>
                    {option.label}
                  </DropdownListItem>
                {/snippet}
              </DropdownList>
            </div>
          {/snippet}
        </Popover>
      {:else}
        <span
          class="verdict-chip"
          class:accept={verdict === "accept"}
          class:reject={verdict === "reject"}>
          <Icon name={verdictIcon(verdict)} />
          {verdict === "accept"
            ? "Accepted"
            : verdict === "reject"
              ? "Rejected"
              : "Reviewed"}
        </span>
      {/if}
      {#if reviewedRevision}
        <span>
          Revision {reviewedRevisionNumber} of {revisions.length}
        </span>
        <Id
          id={reviewedRevision.id}
          clipboard={reviewedRevision.id}
          label="revision ID" />
      {/if}
      <span class="timestamp" title={absoluteTimestamp(timestamp)}>
        {formatTimestamp(timestamp)}
      </span>
      {#if isOwnPublishedReview}
        <span style:margin-left="auto"></span>
        <Popover
          popoverPadding="0"
          placement="bottom-end"
          bind:expanded={deleteConfirmExpanded}>
          {#snippet toggle(onclick)}
            <Button
              variant="naked"
              {onclick}
              active={deleteConfirmExpanded}
              disabled={deleting}
              title="Delete review">
              <Icon name="trash" />
              Delete
            </Button>
          {/snippet}
          {#snippet popover()}
            <div class="delete-confirm">
              <div class="delete-confirm-message">
                Delete this review? This cannot be undone.
              </div>
              <div class="delete-confirm-actions">
                <Button variant="naked" onclick={() => closeFocused()}>
                  Cancel
                </Button>
                <button
                  type="button"
                  class="delete-confirm-button"
                  onclick={deleteReview}
                  disabled={deleting}>
                  <Icon name="trash" />
                  Delete review
                </button>
              </div>
            </div>
          {/snippet}
        </Popover>
      {/if}
    </div>

    {#if editingSummary}
      <div>
        <ExtendedTextarea
          {rid}
          body={review.summary ?? ""}
          focus
          submitCaption={savingSummary ? "Saving…" : "Save"}
          disableSubmit={savingSummary}
          submit={async ({ comment }) => {
            await saveSummary(comment);
          }}
          close={() => (editingSummary = false)} />
      </div>
    {:else if summary !== "" || isOwnPublishedReview}
      <div class="summary">
        {#if summary !== ""}
          <Markdown
            {rid}
            breaks
            content={review.summary ?? ""}
            toggleTaskItem={isOwnPublishedReview
              ? async content => {
                  await saveSummary(content);
                }
              : undefined} />
        {:else}
          <span class="summary-empty">No summary.</span>
        {/if}
        {#if isOwnPublishedReview}
          <button
            type="button"
            class="action-icon summary-edit"
            title="Edit summary"
            onclick={() => (editingSummary = true)}>
            <Icon name="edit" />
          </button>
        {/if}
      </div>
    {/if}

    <Discussion
      {repoDelegates}
      cobId={patch.id}
      {rid}
      {commentThreads}
      {config}
      createComment={createDiscussionComment}
      editComment={codeActions.editComment}
      deleteComment={codeActions.deleteComment}
      reactOnComment={codeActions.reactOnComment}
      flush />

    {#if loadedDiff && !hasLineComments}
      <div class="no-line-comments txt-body-m-regular">
        This review has no line comments.
      </div>
    {/if}
  </div>
{/snippet}

<!-- Spans both columns and pins to the top of the scroll port, so what the
     review adds up to and the controls that act on it stay in reach however far
     down the diff you are. Its left half is the comment column's own heading,
     which is why it is as wide as that column. -->
{#snippet stickyBar()}
  <div class="sticky-bar">
    {#if sideColumnShown}
      <div class="sticky-bar-summary" style:width={commentColumnWidth}>
        {#if sideColumnMode === "comments"}
          <span class="icon"><Icon name="comment" /></span>
          {lineCommentThreads.length}
          {pluralize("comment", lineCommentThreads.length)} ·
          {resolvedLineComments} resolved
        {:else}
          <span class="icon"><Icon name="document" /></span>
          {treeFiles.length}
          {pluralize("file", treeFiles.length)}
        {/if}
      </div>
    {/if}
    <!-- Everything from here sits at the left edge of the file column, whether
         that is beside the side column or at the far left once it is away. -->
    <Button
      variant="naked"
      title={sideColumnShown ? "Hide the column" : "Show the column"}
      onclick={() => (sideColumnShown = !sideColumnShown)}>
      <Icon name={sideColumnShown ? "sidebar-left-filled" : "sidebar-left"} />
    </Button>
    <!-- One column with two things it can hold, so the two buttons are joined
         into a single control where exactly one is on. -->
    <div
      class="sticky-bar-modes"
      role="radiogroup"
      aria-label="Column contents">
      <Button
        variant="ghost"
        flatRight
        active={sideColumnMode === "comments"}
        title="Show the review's comments"
        onclick={() => {
          sideColumnMode = "comments";
          sideColumnShown = true;
        }}>
        <Icon name="comment" />
      </Button>
      <Button
        variant="ghost"
        flatLeft
        active={sideColumnMode === "tree"}
        title="Show the files"
        onclick={() => {
          sideColumnMode = "tree";
          sideColumnShown = true;
        }}>
        <Icon name="document" />
      </Button>
    </div>
    <!-- Only where the two differ: a review that comments on every file the
         revision touches has nothing to filter, and the toggle would sit there
         saying it had switched to the same set of files.

         Says where things stand rather than what the click does, so it can carry
         the pressed state like the pair beside it. Both states name their count:
         how many files are on screen is the question either way. -->
    {#if commentedPaths.size < diffFiles.length}
      <Button
        variant="naked"
        active={onlyCommentedFiles}
        title={onlyCommentedFiles
          ? "Showing only the files with comments"
          : "Showing every file in the revision"}
        onclick={() => (onlyCommentedFiles = !onlyCommentedFiles)}>
        <span class="txt-body-m-regular">
          {#if onlyCommentedFiles}
            {commentedPaths.size} commented
          {:else}
            All {diffFiles.length} {pluralize("file", diffFiles.length)}
          {/if}
        </span>
      </Button>
    {/if}
    <div class="sticky-bar-actions">
      <Button
        variant="naked"
        title={filesExpanded ? "Collapse all files" : "Expand all files"}
        onclick={() => setAllFilesCollapsed(filesExpanded)}>
        <Icon name={filesExpanded ? "collapse-vertical" : "expand-vertical"} />
      </Button>
    </div>
  </div>
{/snippet}

{#snippet sideColumn()}
  {#if sideColumnMode === "comments"}
    <div class="side-column">
      <ReviewCommentList
        groups={orderedGroups}
        {resolvedBy}
        selectedId={highlightedCommentId}
        onSelect={revealComment} />
    </div>
  {:else}
    <!-- The tree fills its box rather than growing with its rows, so it needs a
         height to scroll inside: `max-height` alone leaves it indefinite and the
         tree collapses. -->
    <div class="side-column tree">
      <PierreTree
        paths={treeFiles.map(file => file.path)}
        gitStatus={treeFiles}
        onSelect={path => diffView?.scrollToFile(path)} />
    </div>
  {/if}
{/snippet}

<!-- The diff owns the scroll port, and the review's own chrome rides inside it
     as a non-virtualized header, so it scrolls away and leaves the file headers
     pinned — the same arrangement as the Changes tab. -->
<PierreDiff
  bind:this={diffView}
  patch={loadedDiff?.text ?? ""}
  cacheKeyPrefix={loadedDiff?.key}
  diffStyle={diffOptions.diffStyle}
  wordWrap={diffOptions.wordWrap}
  diffIndicators={diffOptions.indicators}
  lineDiffType={diffOptions.lineDiffType}
  {loadFullFile}
  fileNotes={fileMeta.notes}
  fileStatuses={fileMeta.statuses}
  fileDiffText={reviewedRevision
    ? path =>
        getDiffText(rid, reviewedRevision.base, reviewedRevision.head, 3, path)
    : undefined}
  includePaths={visiblePaths}
  overlayLeft={hasLineComments && sideColumnShown ? sideColumn : undefined}
  overlayLeftWidth={commentColumnWidth}
  stickyTop={hasLineComments ? stickyBar : undefined}
  codeComments={reviewCodeComments}
  commentCommit={reviewedRevision?.head}
  {highlightedCommentId}
  header={chrome} />
