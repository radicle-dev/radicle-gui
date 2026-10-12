<script lang="ts">
  import type { CommentOrigin } from "@app/components/Comment.svelte";
  import type { Author } from "@bindings/cob/Author";
  import type { Operation } from "@bindings/cob/Operation";
  import type { Action } from "@bindings/cob/patch/Action";
  import type { Revision } from "@bindings/cob/patch/Revision";
  import type { Verdict } from "@bindings/cob/patch/Verdict";
  import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";
  import type { Embed } from "@bindings/cob/thread/Embed";
  import type { Thread } from "@bindings/cob/thread/Thread";
  import type { Config } from "@bindings/config/Config";
  import type { Commit } from "@bindings/repo/Commit";
  import type { Snippet } from "svelte";

  import mapValues from "lodash/mapValues";
  import partial from "lodash/partial";
  import { slide } from "svelte/transition";

  import type { CommentOwner } from "@app/lib/codeCommentActions";
  import { commentActions } from "@app/lib/codeCommentActions";
  import type { CodeComments } from "@app/lib/codeComments";
  import { resolutionsByComment } from "@app/lib/commentResolutions";
  import { STANDALONE_COMMENTS } from "@app/lib/commentSources";
  import { diffOptions } from "@app/lib/diffOptions.svelte";
  import { fileDiffPath, fileStatusLabel } from "@app/lib/diffText";
  import { draftReviewStorage } from "@app/lib/draftReviewStorage";
  import { nodeRunning } from "@app/lib/events";
  import { isIgnoredFile } from "@app/lib/ignoredFiles";
  import {
    cachedGetDiff,
    cachedGetDiffText,
    cachedListCommits,
    invoke,
  } from "@app/lib/invoke";
  import type { PatchActivityData } from "@app/lib/patchTimeline";
  import { patchTimeline } from "@app/lib/patchTimeline";
  import {
    groupCommitsByAuthor,
    isCommitListDescription,
    replaceDescriptionBody,
    splitDescription,
    visibleCommitsOf,
  } from "@app/lib/revisionDescription";
  import { newCommitsByRevision } from "@app/lib/revisionList";
  import * as roles from "@app/lib/roles";
  import { push } from "@app/lib/router";
  import {
    buildThreads,
    codeThreadsByReview,
    discussionThreadsByReview as discussionThreadsByReviewOf,
    groupThreadsByFile,
    isCodeRoot,
    reviewIdByComment,
    revisionDiscussionThreads,
    revisionIdByComment,
  } from "@app/lib/threads";
  import {
    authorForNodeId,
    didFromPublicKey,
    pluralize,
    publicKeyFromDid,
    unqualifyBranch,
  } from "@app/lib/utils";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import Changes from "@app/components/Changes.svelte";
  import CommitActivityItem from "@app/components/CommitActivityItem.svelte";
  import Discussion from "@app/components/Discussion.svelte";
  import ExtendedTextarea from "@app/components/ExtendedTextarea.svelte";
  import FileBlock from "@app/components/FileBlock.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import PatchActivityItem from "@app/components/PatchActivityItem.svelte";
  import Path from "@app/components/Path.svelte";
  import PierreSnippet from "@app/components/PierreSnippet.svelte";
  import { closeFocused } from "@app/components/Popover.svelte";
  import Reactions from "@app/components/Reactions.svelte";
  import ReactionSelector from "@app/components/ReactionSelector.svelte";
  import ReviewCodeThread from "@app/components/ReviewCodeThread.svelte";
  import ReviewItem from "@app/components/ReviewItem.svelte";
  import ThreadComponent from "@app/components/Thread.svelte";

  type ActivityData = PatchActivityData;

  interface Props {
    rid: string;
    repoDelegates: Author[];
    patchId: string;
    // The patch's resolved merge target, fully qualified.
    patchTargetBranch?: string;
    revision: Revision;
    config: Config;
    loadPatch: () => Promise<void>;
    view?: "description" | "activity" | "changes";
    activity?: Operation<Action>[];
    revisions?: Revision[];
    draftReviewId?: string;
    // Every revision holding an unpublished draft review, so each row in the
    // revision list can be marked, not just the selected one.
    draftRevisionIds?: string[];
    showingRevisionDiff?: boolean;
    // Whether the description is being edited, so the view around it can keep
    // it open rather than collapsing what is being typed.
    editingDescription?: boolean;
    // Review ids (and `STANDALONE_COMMENTS`) whose code comments are
    // hidden from the diff.
    hiddenCommentSources?: string[];
    filesExpanded?: boolean;
    onViewChanges?: (revisionId: string) => void;
    // The patch view's own header, forwarded to the Changes tab so it can render
    // it inside the diff's scroll content.
    chrome?: Snippet;
    // The view switcher, which the Changes tab sticks to the top of the diff.
    tabs?: Snippet;
    // Where the Changes tab's comment stepper stands, for the tab bar to render.
    commentPosition?: { index: number; total: number };
  }

  /* eslint-disable prefer-const */
  let {
    rid,
    repoDelegates,
    patchId,
    patchTargetBranch,
    revision,
    config,
    loadPatch,
    view = "activity",
    activity = [],
    revisions = [],
    draftReviewId,
    draftRevisionIds = [],
    showingRevisionDiff = $bindable(true),
    editingDescription = $bindable(false),
    hiddenCommentSources = [],
    filesExpanded = $bindable(true),
    onViewChanges,
    chrome,
    tabs,
    commentPosition = $bindable({ index: -1, total: 0 }),
  }: Props = $props();
  /* eslint-enable prefer-const */
  let changes = $state<ReturnType<typeof Changes> | undefined>();

  /// Forwarded to the Changes tab so the tab bar, which the patch view renders,
  /// can collapse or expand every file.
  export function setAllFilesCollapsed(collapsed: boolean) {
    changes?.setAllFilesCollapsed(collapsed);
  }

  /// Forwarded to the Changes tab so the tab bar's stepper can walk the comments
  /// on the diff.
  export function stepComment(delta: number) {
    changes?.stepComment(delta);
  }

  /// Forwarded to the Changes tab so the draft review bar, which lives further
  /// up in the patch view, can scroll the diff to one of its comments.
  export async function revealComment(location: CodeLocation) {
    await changes?.revealComment(location);
  }

  const currentUserAuthor: Author = $derived({
    did: didFromPublicKey(config.publicKey),
    alias: config.alias ?? undefined,
  });

  // Timeline order, as delivered — see `revisionPosition`.
  const latestRevisionId = $derived(revisions.at(-1)?.id);
  const firstRevisionId = $derived(revisions[0]?.id);
  const targetBranch = $derived(
    patchTargetBranch === undefined
      ? undefined
      : unqualifyBranch(patchTargetBranch),
  );
  let revisionToggles: Record<string, boolean> = $state({});
  let commitGroupToggles: Record<string, boolean> = $state({});
  let expandedRevisionRuns: Record<string, boolean> = $state({});
  let revisionDescriptionEdits: Record<string, boolean> = $state({});

  // svelte-ignore state_referenced_locally
  let lastPatchIdSeen = patchId;
  // svelte-ignore state_referenced_locally
  let lastViewSeen = view;
  $effect(() => {
    if (patchId !== lastPatchIdSeen || view !== lastViewSeen) {
      lastPatchIdSeen = patchId;
      lastViewSeen = view;
      revisionToggles = {};
      commitGroupToggles = {};
      expandedRevisionRuns = {};
      revisionDescriptionEdits = {};
    }
  });
  function isRevisionExpanded(revId: string): boolean {
    if (revId in revisionToggles) {
      return revisionToggles[revId];
    }
    return revId === latestRevisionId;
  }
  function toggleRevision(revId: string) {
    revisionToggles = {
      ...revisionToggles,
      [revId]: !isRevisionExpanded(revId),
    };
  }
  function isEditingRevisionDescription(revId: string): boolean {
    return revisionDescriptionEdits[revId] ?? false;
  }
  function setEditingRevisionDescription(revId: string, editing: boolean) {
    revisionDescriptionEdits = {
      ...revisionDescriptionEdits,
      [revId]: editing,
    };
  }
  function isCommitGroupExpanded(groupKey: string): boolean {
    return commitGroupToggles[groupKey] ?? false;
  }
  function expandCommitGroup(groupKey: string) {
    commitGroupToggles = { ...commitGroupToggles, [groupKey]: true };
  }
  function toggleRevisionRun(groupKey: string, revisionIds: string[]) {
    const nowExpanded = !(expandedRevisionRuns[groupKey] ?? false);
    expandedRevisionRuns = { ...expandedRevisionRuns, [groupKey]: nowExpanded };
    // Collapsing the run also collapses any revisions expanded inside it, so
    // re-expanding the run shows them folded again rather than as they were.
    if (!nowExpanded) {
      const next = { ...revisionToggles };
      for (const revId of revisionIds) {
        delete next[revId];
      }
      revisionToggles = next;
    }
  }
  const draftReview = $derived(
    draftReviewStorage.getForRevision(revision.id, currentUserAuthor),
  );

  const ownPublishedReview = $derived(
    revision.reviews?.find(r => r.author.did === currentUserAuthor.did),
  );
  const hasPublishedReview = $derived(Boolean(ownPublishedReview));

  const codeCommentThreads: Thread<CodeLocation>[] = $derived(
    draftReview ? buildThreads(draftReview.comments, isCodeRoot) : [],
  );

  async function createCodeComment(
    body: string,
    embeds: Embed[],
    replyTo?: string,
    location?: CodeLocation,
  ) {
    if (replyTo) {
      const reviewId = commentToReviewId.get(replyTo);
      try {
        await invoke("edit_patch", {
          rid,
          cobId: patchId,
          action: reviewId
            ? {
                type: "review.comment",
                review: reviewId,
                body,
                replyTo,
                embeds,
              }
            : {
                type: "revision.comment",
                revision: revision.id,
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
      return;
    }
    if (!location) return;
    try {
      let draftId = draftReview?.id;
      if (!draftId) {
        draftId = draftReviewStorage.create(
          rid,
          patchId,
          revision.id,
          config.publicKey,
        );
      }
      draftReviewStorage.addComment(draftId, { body, location });
    } catch (error) {
      console.error("Creating code comment failed", error);
    } finally {
      await loadPatch();
    }
  }

  async function createCodeCommentDirect(
    body: string,
    embeds: Embed[],
    location: CodeLocation,
  ) {
    try {
      await invoke("create_patch_comment", {
        rid,
        new: {
          id: patchId,
          body,
          embeds,
          location,
          revision: revision.id,
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Creating code comment failed", error);
    } finally {
      await loadPatch();
    }
  }

  // After the user has published a review for this revision, a new line comment
  // is added to that existing review rather than silently starting a second
  // one. Replies still thread onto the comment they answer.
  async function addCommentAfterReview(
    body: string,
    embeds: Embed[],
    replyTo?: string,
    location?: CodeLocation,
  ) {
    if (replyTo) {
      await createCodeComment(body, embeds, replyTo);
      return;
    }
    const reviewId = ownPublishedReview?.id;
    if (!reviewId || !location) return;
    try {
      await invoke("edit_patch", {
        rid,
        cobId: patchId,
        action: {
          type: "review.comment",
          review: reviewId,
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
  }

  // Comments on a review itself rather than on a line. Kept apart from
  // `threadsByReview`, which feeds the diff and must only carry threads that
  // can be anchored to a line.
  const discussionThreadsByReview = $derived(
    discussionThreadsByReviewOf(revision.reviews ?? []),
  );

  const commentToReviewId = $derived.by(() =>
    reviewIdByComment(threadsByReview, discussionThreadsByReview),
  );

  const commentToRevisionId = $derived(revisionIdByComment(revisions));

  // Every code-comment mutation dispatches on the owning object; resolving it
  // once here keeps the actions shared.
  function ownerOf(commentId: string): CommentOwner | undefined {
    if (draftReview?.comments.some(c => c.id === commentId)) {
      return { kind: "draft", draftId: draftReview.id };
    }
    const reviewId = commentToReviewId.get(commentId);
    if (reviewId) return { kind: "review", reviewId };
    return {
      kind: "revision",
      revisionId: commentToRevisionId.get(commentId) ?? revision.id,
    };
  }

  // The protocol lets the comment author, the review author or the revision
  // author resolve a review comment; delegates may do anything. Standalone
  // revision comments have no resolve action at all.
  // A comment records only that it is resolved, so who did it has to come from
  // the patch's operation log.
  const resolutions = $derived(resolutionsByComment(activity));
  function resolvedBy(commentId: string) {
    return resolutions.get(commentId);
  }

  function canResolveComment(commentId: string): boolean {
    const owner = ownerOf(commentId);
    if (owner?.kind !== "review") return false;
    const review = (revision.reviews ?? []).find(r => r.id === owner.reviewId);
    return roles.canResolveReviewComment(
      config.publicKey,
      repoDelegates.map(d => d.did),
      {
        comment: review?.comments?.find(c => c.id === commentId)?.author.did,
        review: review?.author.did,
        revision: revision.author.did,
      },
    );
  }

  const codeActions = $derived(
    commentActions({
      rid,
      patchId,
      publicKey: config.publicKey,
      announce: $nodeRunning && $announce,
      ownerOf,
      reload: loadPatch,
    }),
  );

  const publishedReviewThreads: Thread<CodeLocation>[] = $derived.by(() => {
    const list: Thread<CodeLocation>[] = [];
    for (const [reviewId, threads] of threadsByReview.entries()) {
      if (hiddenCommentSources.includes(reviewId)) continue;
      list.push(...threads);
    }
    return list;
  });

  // Each superimposed thread says which review it belongs to and links back
  // to it, since several reviews' comments share the same diff.
  const threadOrigins: Record<string, CommentOrigin> = $derived.by(() => {
    const origins: Record<string, CommentOrigin> = {};
    for (const [reviewId, threads] of threadsByReview.entries()) {
      const origin: CommentOrigin = {
        text: "in review",
        title: "Go to this review",
        onclick: () =>
          void push({
            resource: "repo.patch",
            rid,
            patch: patchId,
            status: undefined,
            reviewId,
            view: view === "changes" ? "changes" : undefined,
          }),
      };
      for (const thread of threads) {
        origins[thread.root.id] = origin;
      }
    }
    return origins;
  });

  // Standalone code comments posted directly on the revision (via
  // `create_patch_comment`), not part of any review. Gathered here so they
  // render on the diff alongside review comments instead of vanishing.
  const revisionCodeCommentThreads: Thread<CodeLocation>[] = $derived.by(() => {
    if (hiddenCommentSources.includes(STANDALONE_COMMENTS)) return [];
    return buildThreads(revision.discussion ?? [], isCodeRoot);
  });

  const codeComments: CodeComments | undefined = $derived.by(() => {
    const combinedThreads = [
      ...codeCommentThreads,
      ...revisionCodeCommentThreads,
      ...publishedReviewThreads,
    ];
    const draftThreadIds = codeCommentThreads.map(t => t.root.id);
    if (hasPublishedReview) {
      return {
        config,
        createComment: addCommentAfterReview,
        newCommentCaption: "Add to review",
        newCommentDescription:
          "Adds this comment to your published review of this revision.",
        editComment: codeActions.editComment,
        deleteComment: codeActions.deleteComment,
        changeCommentStatus: codeActions.changeCommentStatus,
        canResolveComment,
        resolvedBy,
        reactOnComment: codeActions.reactOnComment,
        repoDelegates,
        rid,
        threads: combinedThreads,
        draftThreadIds,
        threadOrigins,
        canReply: true,
        hideThreadFileHeader: true,
      };
    }
    return {
      config,
      createComment: createCodeComment,
      addCodeCommentDirect: createCodeCommentDirect,
      newCommentCaption: draftReview ? "Add to review" : "Start review",
      newCommentDescription: draftReview
        ? "Save this in your draft review and publish later with a verdict."
        : "Begin a draft review. You can add more comments before publishing.",
      addCodeCommentDirectCaption: "Just comment",
      addCodeCommentDirectDescription:
        "Post this comment now, without starting or contributing to a review.",
      editComment: codeActions.editComment,
      deleteComment: codeActions.deleteComment,
      changeCommentStatus: codeActions.changeCommentStatus,
      canResolveComment,
      resolvedBy,
      reactOnComment: codeActions.reactOnComment,
      repoDelegates,
      rid,
      threads: combinedThreads,
      draftThreadIds,
      threadOrigins,
      // Replying to a comment isn't possible while a review is still a draft;
      // publish first. (With a published review, the branch above adds replies
      // to it.)
      canReply: !draftReview,
      hideThreadFileHeader: true,
      disableAttachments: "Publish your review to attach files",
    };
  });

  let commitsByRevision: Record<string, Commit[]> = $state({});

  $effect(() => {
    const ridLocal = rid;
    void Promise.all(
      revisions.map(async (rev): Promise<[string, Commit[]]> => {
        try {
          const commits = await cachedListCommits(ridLocal, rev.base, rev.head);
          return [rev.id, commits];
        } catch (error) {
          console.error(
            `Failed to load commits for revision ${rev.id} (${rev.base}..${rev.head})`,
            error,
          );
          return [rev.id, []];
        }
      }),
    ).then(entries => {
      const commits = Object.fromEntries(entries);
      // Newest first, as the timeline lists them.
      commitsByRevision = mapValues(
        newCommitsByRevision(revisions, id => commits[id] ?? []),
        added => [...added].reverse(),
      );
    });
  });
  const olderRevisionIds = $derived(
    new Set(revisions.filter(r => r.id !== latestRevisionId).map(r => r.id)),
  );

  const threadsByReview = $derived(codeThreadsByReview(revision.reviews ?? []));

  const activityItems = $derived(
    patchTimeline({
      activity,
      revisions,
      commitsByRevision,
      threadsByReview,
      discussionThreadsByReview,
      expandedRevisionRuns,
    }),
  );
  // Gather discussion comments from every revision, not just the selected one,
  // so comments left on a revision stay in the timeline after a newer revision
  // is pushed. Discussion.svelte orders the merged timeline by timestamp.
  const commentThreads = $derived(
    revisionDiscussionThreads(revisions) as unknown as Thread[],
  );

  async function editRevision(
    description: string,
    embeds: Embed[],
    revisionId: string = revision.id,
  ) {
    try {
      await invoke("edit_patch", {
        rid: rid,
        cobId: patchId,
        action: {
          type: "revision.edit",
          revision: revisionId,
          description,
          embeds,
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Editing revision failed: ", error);
    } finally {
      await loadPatch();
    }
  }

  async function editReviewSummary(
    reviewId: string,
    summary: string,
    review: { verdict?: Verdict; labels?: string[] },
  ) {
    try {
      await invoke("edit_patch", {
        rid,
        cobId: patchId,
        action: {
          type: "review.edit",
          review: reviewId,
          summary,
          verdict: review.verdict,
          labels: review.labels ?? [],
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Editing review summary failed: ", error);
    } finally {
      await loadPatch();
    }
  }

  async function createComment(
    body: string,
    embeds: Embed[],
    replyTo?: string,
  ) {
    try {
      const targetRevision = replyTo
        ? (commentToRevisionId.get(replyTo) ?? revision.id)
        : revision.id;
      await invoke("create_patch_comment", {
        rid: rid,
        new: { id: patchId, body, embeds, replyTo, revision: targetRevision },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Creating comment failed", error);
    } finally {
      await loadPatch();
    }
  }

  async function reactOnRevision(authors: Author[], reaction: string) {
    try {
      await invoke("edit_patch", {
        rid: rid,
        cobId: patchId,
        action: {
          type: "revision.react",
          revision: revision.id,
          reaction,
          active: !authors.find(
            ({ did }) => publicKeyFromDid(did) === config.publicKey,
          ),
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Editing revision reactions failed", error);
    } finally {
      await loadPatch();
    }
  }
</script>

<style>
  .patch-body {
    position: relative;
    margin-bottom: 2.5rem;
  }
  .patch-reactions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .patch-body:has(.body-actions) {
    padding-right: 4rem;
  }
  .body-actions {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }
  /* A fixed square rather than padding around whatever is nested inside: the
     reaction trigger sits in a block wrapper, so its icon forms a line box and
     took the leading with it, making the button taller than the edit one. */
  .body-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    background: none;
    border: none;
    padding: 0;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    color: var(--color-text-tertiary);
    opacity: 0;
    transition: opacity 150ms ease;
  }
  /* The trigger brings its own padding, colour and hover fill; the body action
     around it already provides all three. */
  .body-action :global(.global-icon-button) {
    display: flex;
    padding: 0;
    color: inherit;
    background-color: transparent;
  }
  .patch-body:hover .body-action,
  .patch-body:focus-within .body-action,
  .body-action:focus-visible {
    opacity: 1;
  }
  .body-action:hover,
  .body-action:focus-visible {
    color: var(--color-text-primary);
    background-color: var(--color-surface-subtle);
  }
  .patch-body :global(.card-header),
  .patch-body :global(.card-body),
  .patch-body :global(.actions) {
    padding-left: 0;
    padding-right: 0;
  }
  .commit-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .commit-group-author {
    padding-left: 0.5rem;
    color: var(--color-text-tertiary);
  }
  .commit-group-children {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .revision-card {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    margin: 0.5rem 0;
    overflow: hidden;
  }
  .revision-card-body {
    display: flex;
    flex-direction: column;
  }
  .revision-card-description {
    position: relative;
    padding: 1rem;
  }
  .revision-card-description:has(.revision-card-description-actions) {
    padding-right: 3rem;
  }
  .revision-card-description :global(:first-child) {
    margin-top: 0;
  }
  .revision-card-description :global(:last-child) {
    margin-bottom: 0;
  }
  .revision-card-description-actions {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }
  .revision-card:hover .body-action,
  .revision-card:focus-within .body-action,
  .revision-card .body-action:focus-visible {
    opacity: 1;
  }
  .add-description {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--color-text-tertiary);
  }
  .add-description:hover,
  .add-description:focus-visible {
    color: var(--color-text-primary);
  }
  .revision-card-divider {
    height: 1px;
    background-color: var(--color-border-subtle);
  }
  .revision-commits {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    background-color: var(--color-surface-base);
  }
  .revision-commits :global(.timeline-item .icon),
  .revision-commits :global(.older-revisions .icon) {
    background-color: var(--color-surface-base);
  }
  .revision-diff-tease .revision-diff-stats :global(.icon) {
    background-color: var(--color-surface-base);
  }
  .review-threads {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-left: 1.5rem;
    margin-top: 0.5rem;
  }
  .review-threads::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 1rem;
    width: 1px;
    background-color: var(--color-border-subtle);
  }
  .older-revisions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    padding: 0.375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    min-height: 2.5rem;
  }
  .older-revisions:hover,
  .older-revisions:focus-visible {
    background-color: var(--color-surface-subtle);
  }
  .older-revisions .icon {
    width: 1rem;
    display: grid;
    place-items: center;
  }
  .older-revisions .icon-stack {
    display: grid;
    width: 1rem;
    place-items: center;
  }
  .older-revisions .icon-default,
  .older-revisions .icon-hover {
    grid-area: 1 / 1;
    transition:
      opacity 150ms ease,
      transform 150ms ease;
  }
  .older-revisions .icon-hover {
    opacity: 0;
    transform: rotate(-90deg);
  }
  .older-revisions:hover .icon-default,
  .older-revisions:focus-visible .icon-default {
    opacity: 0;
    transform: rotate(90deg);
  }
  .older-revisions:hover .icon-hover,
  .older-revisions:focus-visible .icon-hover {
    opacity: 1;
    transform: rotate(0);
  }
  .summary-secondary {
    color: var(--color-text-tertiary);
  }
  .revision-diff-tease {
    padding: 1rem;
    background-color: var(--color-surface-base);
  }
  .revision-diff-loading,
  .revision-diff-error {
    color: var(--color-text-tertiary);
  }
  .revision-diff-stats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 0.5rem;
    color: var(--color-text-secondary);
  }
  .file-fan {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  .file-fan::after {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 6rem;
    background: linear-gradient(
      to left,
      var(--color-surface-base),
      transparent
    );
    pointer-events: none;
    z-index: 6;
  }
  .file-fan-stack {
    --fan-overlap: 20%;
    display: flex;
    align-items: flex-start;
    overflow: hidden;
    height: 10rem;
    padding: 0.5rem 0 0;
  }
  .file-fan-card {
    position: relative;
    flex: 0 0
      calc(
        (100% + (var(--card-count, 5) - 1) * var(--fan-overlap, 20%)) /
          var(--card-count, 5)
      );
    max-width: calc(
      (100% + (var(--card-count, 5) - 1) * var(--fan-overlap, 20%)) /
        var(--card-count, 5)
    );
    height: 100%;
    margin-left: calc(var(--fan-overlap, 20%) * -1);
    background-color: var(--color-surface-canvas);
    /* Match the FileDiff's rounded corners so the card background doesn't show
       through as white triangles at the corners. */
    border-radius: var(--border-radius-md);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    overflow: hidden;
  }
  .file-fan-card.first {
    margin-left: 0;
  }
  .file-fan-card-inner {
    height: 100%;
    overflow: hidden;
    /* The fan is a decorative preview behind the button, so mute the busy diff
       colours to keep the "View all revision changes" button the focal point. */
    opacity: 0.8;
    /* Drop the per-file diff border/divider in the preview. `--color-border-subtle`
       inherits into Pierre's shadow DOM, where the card border is a box-shadow. */
    --color-border-subtle: transparent;
  }
  /* Status chips beside the file name, matching `DiffFileHeader`'s. */
  .added {
    color: var(--color-feedback-success-text);
    background-color: var(--color-feedback-success-bg);
  }
  .deleted {
    color: var(--color-feedback-error-text);
    background-color: var(--color-feedback-error-bg);
  }
  .moved,
  .copied {
    color: var(--color-text-secondary);
    background: var(--color-surface-subtle);
  }
  /* In the decorative fan preview, show only the file name, not the full path
     (`Path` splits the directory into `.path` and the name into `.filename`). */
  .file-fan-card :global(.path) {
    display: none;
  }
  .file-fan-footer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    align-items: flex-end;
    padding: 0 0 2rem;
    height: 7rem;
    z-index: 10;
    pointer-events: none;
  }
  .file-fan-footer .diff-tease-button {
    pointer-events: auto;
  }
  .file-fan-fade {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      var(--color-surface-base) 100%
    );
    pointer-events: none;
  }
  .diff-tease-button {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid transparent;
    border-radius: var(--border-radius-sm);
    /* Inverted button: the fill is the usual foreground (text) colour and the
       text is the surface colour, for a solid high-contrast button that stays
       legible against the busy diff preview behind it. */
    background-color: var(--color-text-primary);
    color: var(--color-surface-canvas);
    cursor: pointer;
    box-shadow: var(--elevation-low);
  }
  .diff-tease-button:hover,
  .diff-tease-button:focus-visible {
    background-color: var(--color-text-secondary);
  }
</style>

{#if view === "description"}
  {@const body = revision.description.slice(-1)[0].body}
  {@const canEdit = roles.isDelegateOrAuthor(
    config.publicKey,
    repoDelegates.map(d => d.did),
    revision.author.did,
  )}
  {#if editingDescription}
    <div class="patch-body">
      <ExtendedTextarea
        {rid}
        body={body ?? ""}
        focus
        submitCaption="Save"
        submit={async ({ comment, embeds }) => {
          await editRevision(comment, Array.from(embeds.values()));
          editingDescription = false;
        }}
        close={() => (editingDescription = false)} />
    </div>
  {:else}
    <div class="patch-body txt-body-m-regular">
      {#if body.trim() !== ""}
        <Markdown
          {rid}
          content={body}
          toggleTaskItem={canEdit
            ? async content => {
                await editRevision(
                  content,
                  revision.description.slice(-1)[0]?.embeds ?? [],
                );
              }
            : undefined} />
      {:else}
        <span style:color="var(--color-text-tertiary)">No description</span>
      {/if}
      <div class="body-actions">
        <div class="body-action">
          <ReactionSelector
            placement="bottom-end"
            reactions={revision.reactions ?? []}
            select={async ({ authors, emoji }) => {
              try {
                await reactOnRevision(authors, emoji);
              } finally {
                closeFocused();
              }
            }} />
        </div>
        {#if canEdit}
          <button
            type="button"
            class="body-action edit-description"
            title="Edit description"
            onclick={() => (editingDescription = true)}>
            <Icon name="edit" />
          </button>
        {/if}
      </div>
    </div>
  {/if}
  {#if revision.reactions && revision.reactions.length > 0}
    <div class="patch-reactions">
      <Reactions
        handleReaction={reactOnRevision}
        currentUserNid={config.publicKey}
        reactions={revision.reactions} />
    </div>
  {/if}
{:else if view === "activity"}
  {#snippet renderActivity(data: ActivityData, opts: { hideAuthor: boolean })}
    {#if data.kind === "op"}
      {#if data.op.type === "revision"}
        {@const revId = data.op.id}
        {@const isFirst = revId === firstRevisionId}
        {@const isOlder = olderRevisionIds.has(revId)}
        {@const hasCommits = !!data.commits && data.commits.length > 0}
        {@const revBody = isFirst
          ? undefined
          : splitDescription(data.op.description).body}
        {@const hasBody = !!revBody}
        {@const toggleable = hasCommits || hasBody}
        {@const expanded = toggleable && isRevisionExpanded(revId)}
        {@const targetRev = revisions.find(r => r.id === revId)}
        {@const descriptionVisible =
          hasBody &&
          !isCommitListDescription(data.op.description, data.commits)}
        {@const canEditRevision =
          !isFirst &&
          !!targetRev &&
          roles.isDelegateOrAuthor(
            config.publicKey,
            repoDelegates.map(d => d.did),
            targetRev.author.did,
          )}
        {@const fullDescription = data.op.description}
        {@const descriptionSubject = splitDescription(
          data.op.description,
        ).subject}
        {@const descriptionEditorPrefill = isCommitListDescription(
          data.op.description,
          data.commits,
        )
          ? ""
          : (revBody ?? "")}
        {#if expanded}
          <div class="revision-card" transition:slide={{ duration: 180 }}>
            <PatchActivityItem
              op={data.op}
              {rid}
              {patchId}
              latest={revisions.length > 1 && revId === latestRevisionId}
              reviewInProgress={draftRevisionIds.includes(revId)}
              onOpenReview={() => onViewChanges?.(revId)}
              onOpenChanges={onViewChanges
                ? () => onViewChanges?.(revId)
                : undefined}
              {expanded}
              hideAuthor={opts.hideAuthor}
              bodyExternal
              onToggle={toggleable ? () => toggleRevision(revId) : undefined} />
            <div class="revision-card-body">
              {#if isEditingRevisionDescription(revId)}
                <div class="revision-card-description">
                  <ExtendedTextarea
                    {rid}
                    body={descriptionEditorPrefill}
                    focus
                    submitCaption="Save"
                    submit={async ({ comment, embeds }) => {
                      // Keep the revision's subject (its first line, shown as
                      // the title); only replace the body beneath it.
                      const body = comment.trim();
                      const next = descriptionSubject
                        ? body
                          ? `${descriptionSubject}\n\n${body}`
                          : descriptionSubject
                        : body;
                      await editRevision(
                        next,
                        Array.from(embeds.values()),
                        revId,
                      );
                      setEditingRevisionDescription(revId, false);
                    }}
                    close={() => setEditingRevisionDescription(revId, false)} />
                </div>
              {:else if descriptionVisible}
                <div class="revision-card-description txt-body-m-regular">
                  <Markdown
                    {rid}
                    breaks
                    content={revBody}
                    toggleTaskItem={canEditRevision
                      ? async content => {
                          await editRevision(
                            replaceDescriptionBody(fullDescription, content),
                            targetRev?.description.slice(-1)[0]?.embeds ?? [],
                            revId,
                          );
                        }
                      : undefined} />
                  {#if canEditRevision}
                    <div class="revision-card-description-actions">
                      <button
                        type="button"
                        class="body-action edit-description"
                        title="Edit description"
                        onclick={() =>
                          setEditingRevisionDescription(revId, true)}>
                        <Icon name="edit" />
                      </button>
                    </div>
                  {/if}
                </div>
              {:else if canEditRevision}
                <div class="revision-card-description">
                  <button
                    type="button"
                    class="add-description txt-body-m-regular"
                    onclick={() => setEditingRevisionDescription(revId, true)}>
                    <Icon name="edit" />
                    Add a description
                  </button>
                </div>
              {/if}
              {#if (descriptionVisible || canEditRevision) && hasCommits && !isEditingRevisionDescription(revId)}
                <div class="revision-card-divider"></div>
              {/if}
              {#if hasCommits && data.commits && data.commits.length > 0}
                <div class="revision-commits">
                  {#each groupCommitsByAuthor(data.commits) as group (group[0].id)}
                    {#if group.length > 1}
                      {@const groupKey = group[0].id}
                      {@const groupExpanded = isCommitGroupExpanded(groupKey)}
                      {@const {
                        collapsed,
                        visible: visibleCommits,
                        hiddenCount,
                      } = visibleCommitsOf(group, groupExpanded)}
                      <div class="commit-group">
                        <div class="commit-group-author txt-body-m-regular">
                          {group[0].author.name} &lt;{group[0].author.email}&gt;
                          added {group.length} commits
                        </div>
                        <div class="commit-group-children">
                          {#each visibleCommits as commit (commit.id)}
                            <CommitActivityItem {commit} hideAuthor />
                          {/each}
                          {#if collapsed}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <div
                              class="older-revisions txt-body-m-regular"
                              role="button"
                              tabindex="0"
                              transition:slide={{ duration: 180 }}
                              onclick={() => expandCommitGroup(groupKey)}>
                              <div class="icon">
                                <span class="icon-stack">
                                  <span class="icon-default">
                                    <Icon name="commit" />
                                  </span>
                                  <span class="icon-hover">
                                    <Icon name="expand-vertical" />
                                  </span>
                                </span>
                              </div>
                              <span class="summary-secondary">
                                Show {hiddenCount} more
                                {hiddenCount === 1 ? "commit" : "commits"}
                              </span>
                            </div>
                          {/if}
                        </div>
                      </div>
                    {:else}
                      <CommitActivityItem commit={group[0]} />
                    {/if}
                  {/each}
                </div>
              {/if}
              {#if targetRev && targetRev.base !== targetRev.head}
                <!-- Bound outside the `{#await}`; see `ReviewCodeThread`. -->
                {@const revisionDiff = cachedGetDiff(rid, {
                  base: targetRev.base,
                  head: targetRev.head,
                })}
                {#if hasBody || hasCommits}
                  <div class="revision-card-divider"></div>
                {/if}
                <div class="revision-diff-tease">
                  {#await revisionDiff}
                    <div class="revision-diff-loading txt-body-m-regular">
                      Loading diff…
                    </div>
                  {:then diff}
                    {@const previewFiles = diff.files
                      .filter(f => !isIgnoredFile(f))
                      .slice(0, 5)}
                    <div class="revision-diff-stats txt-body-m-regular">
                      <Icon name="diff" />
                      <span>
                        {diff.stats.filesChanged}
                        {pluralize("file", diff.stats.filesChanged)} modified with
                      </span>
                      <span style:color="var(--color-feedback-success-text)">
                        {diff.stats.insertions}
                        {pluralize("insertion", diff.stats.insertions)}
                      </span>
                      <span>and</span>
                      <span style:color="var(--color-feedback-error-text)">
                        {diff.stats.deletions}
                        {pluralize("deletion", diff.stats.deletions)}
                      </span>
                    </div>
                    <div class="file-fan">
                      <div
                        class="file-fan-stack"
                        style:--card-count={previewFiles.length}>
                        {#each previewFiles as file, i (i)}
                          {@const path = fileDiffPath(file)}
                          <div
                            class="file-fan-card"
                            style:z-index={i + 1}
                            class:first={i === 0}>
                            <div class="file-fan-card-inner">
                              <FileBlock expandable={false} sticky={false}>
                                {#snippet leftHeader()}
                                  {@const statusLabel = fileStatusLabel(
                                    file.status,
                                  )}
                                  <Path fullPath={path} />
                                  {#if statusLabel}
                                    <span class="global-chip {file.status}">
                                      {statusLabel}
                                    </span>
                                  {/if}
                                {/snippet}
                                {#snippet rightHeader()}
                                  {#if file.diff.type === "plain"}
                                    <span
                                      style:color="var(--color-feedback-success-text)">
                                      +{file.diff.stats.additions}
                                    </span>
                                    <span
                                      style:color="var(--color-feedback-error-text)">
                                      -{file.diff.stats.deletions}
                                    </span>
                                  {/if}
                                {/snippet}
                                {@const filePatchPromise = cachedGetDiffText(
                                  rid,
                                  targetRev.base,
                                  targetRev.head,
                                  3,
                                  path,
                                )}
                                {#await filePatchPromise}
                                  <div></div>
                                {:then filePatch}
                                  <PierreSnippet
                                    patch={filePatch}
                                    {path}
                                    cacheKey={`fan:${targetRev.head}:${path}`}
                                    diffIndicators={diffOptions.indicators}
                                    lineDiffType={diffOptions.lineDiffType} />
                                {/await}
                              </FileBlock>
                            </div>
                          </div>
                        {/each}
                      </div>
                      <div class="file-fan-footer">
                        <div class="file-fan-fade"></div>
                        <button
                          type="button"
                          class="diff-tease-button txt-body-m-medium"
                          disabled={!onViewChanges}
                          onclick={() => onViewChanges?.(revId)}>
                          View all revision changes
                          <Icon name="arrow-right" />
                        </button>
                      </div>
                    </div>
                  {:catch error}
                    <div class="revision-diff-error txt-body-m-regular">
                      Failed to load diff: {error?.message ?? error}
                    </div>
                  {/await}
                </div>
              {/if}
            </div>
          </div>
        {:else if isOlder}
          <div
            class="older-revision-entry"
            transition:slide={{ duration: 180 }}>
            <PatchActivityItem
              op={data.op}
              {rid}
              {patchId}
              {expanded}
              hideAuthor={opts.hideAuthor}
              onToggle={toggleable ? () => toggleRevision(revId) : undefined}
              onOpenChanges={onViewChanges
                ? () => onViewChanges?.(revId)
                : undefined} />
          </div>
        {:else}
          <PatchActivityItem
            op={data.op}
            {rid}
            {patchId}
            {expanded}
            hideAuthor={opts.hideAuthor}
            onToggle={toggleable ? () => toggleRevision(revId) : undefined}
            onOpenChanges={onViewChanges
              ? () => onViewChanges?.(revId)
              : undefined} />
        {/if}
      {:else if data.op.type === "review"}
        {@const opId = data.op.id}
        {@const threads = data.reviewThreads ?? []}
        {@const hasThreads = threads.length > 0}
        {@const discussion = data.reviewComments ?? []}
        {@const reviewRecord = (revision.reviews ?? []).find(
          r => r.id === opId,
        )}
        {@const hasReviewComments = (reviewRecord?.comments?.length ?? 0) > 0}
        {@const reviewOp = data.op}
        <ReviewItem
          {rid}
          author={data.op.author}
          verdict={data.op.verdict}
          summary={data.op.summary ?? ""}
          timestamp={data.op.timestamp}
          toggleTaskItem={data.op.author.did ===
          didFromPublicKey(config.publicKey)
            ? async summary => {
                await editReviewSummary(opId, summary, reviewOp);
              }
            : undefined}
          onViewFullReview={hasReviewComments
            ? () =>
                void push({
                  resource: "repo.patch",
                  rid,
                  patch: patchId,
                  status: undefined,
                  reviewId: opId,
                })
            : undefined} />
        {#if discussion.length > 0}
          <div class="review-threads">
            {#each discussion as thread (thread.root.id)}
              <ThreadComponent
                {rid}
                {thread}
                inline
                currentUserNid={config.publicKey}
                canModifyComment={partial(
                  roles.isDelegateOrAuthor,
                  config.publicKey,
                  repoDelegates.map(delegate => delegate.did),
                )}
                editComment={codeActions.editComment}
                deleteComment={codeActions.deleteComment}
                reactOnComment={codeActions.reactOnComment}
                createReply={createCodeComment} />
            {/each}
          </div>
        {/if}
        {#if hasThreads}
          <div class="review-threads">
            {#each groupThreadsByFile(threads) as group (group.path)}
              <ReviewCodeThread
                {rid}
                base={revision.base}
                head={revision.head}
                threads={group.threads}
                {config}
                {repoDelegates}
                createComment={createCodeComment}
                editComment={codeActions.editComment}
                deleteComment={codeActions.deleteComment}
                reactOnComment={codeActions.reactOnComment}
                changeCommentStatus={codeActions.changeCommentStatus}
                {canResolveComment}
                {resolvedBy} />
            {/each}
          </div>
        {/if}
      {:else}
        <PatchActivityItem
          op={data.op}
          hideAuthor={opts.hideAuthor}
          targetBranch={data.op.type === "merge" ? targetBranch : undefined} />
      {/if}
    {:else if data.kind === "opened"}
      <PatchActivityItem
        op={data.op}
        firstRevision
        openedAsDraft={data.openedAsDraft}
        hideAuthor={opts.hideAuthor} />
    {:else if data.kind === "olderRevisions"}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="older-revisions txt-body-m-regular"
        role="button"
        tabindex="0"
        transition:slide={{ duration: 180 }}
        onclick={() => toggleRevisionRun(data.groupKey, data.revisionIds)}>
        <div class="icon">
          <span class="icon-stack">
            <span class="icon-default">
              <Icon name={data.expanded ? "collapse-vertical" : "revision"} />
            </span>
            <span class="icon-hover">
              <Icon
                name={data.expanded
                  ? "collapse-vertical"
                  : "expand-vertical"} />
            </span>
          </span>
        </div>
        {#if !opts.hideAuthor && data.author}
          <NodeId {...authorForNodeId(data.author)} />
        {/if}
        <span class="summary-secondary">
          {#if data.expanded}
            collapse {data.count}
            {data.count === 1 ? "revision" : "revisions"}
          {:else}
            created {data.count}
            {data.count === 1 ? "revision" : "revisions"}
          {/if}
        </span>
      </div>
    {/if}
  {/snippet}

  <Discussion
    {repoDelegates}
    cobId={patchId}
    {commentThreads}
    {config}
    {createComment}
    editComment={codeActions.editComment}
    deleteComment={codeActions.deleteComment}
    reactOnComment={codeActions.reactOnComment}
    {rid}
    {activityItems}
    {renderActivity}
    authorOf={data =>
      data.kind === "op" || data.kind === "opened"
        ? data.op.author
        : data.author} />
{:else}
  {@const canEditChanges = roles.isDelegateOrAuthor(
    config.publicKey,
    repoDelegates.map(d => d.did),
    revision.author.did,
  )}
  <Changes
    bind:this={changes}
    {rid}
    {patchId}
    {revision}
    {codeComments}
    {draftReviewId}
    canEditDescription={canEditChanges}
    onSaveDescription={async (body, embeds) => {
      await editRevision(body, embeds, revision.id);
    }}
    {chrome}
    {tabs}
    bind:showingRevisionDiff
    bind:filesExpanded
    bind:commentPosition />
{/if}
