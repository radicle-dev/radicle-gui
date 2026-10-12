<script lang="ts">
  import type { PatchView } from "@app/views/repo/router";
  import type { Author } from "@bindings/cob/Author";
  import type { Patch } from "@bindings/cob/patch/Patch";
  import type { Revision } from "@bindings/cob/patch/Revision";
  import type { Config } from "@bindings/config/Config";
  import type { Stats } from "@bindings/diff/Stats";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";
  import type { RepoRefs } from "@bindings/repo/RepoRefs";

  import { nodeRunning } from "@app/lib/events";
  import { invoke } from "@app/lib/invoke";
  import type { ReviewEntry } from "@app/lib/reviewSummary";
  import {
    entriesFromRevisions,
    isOutdatedReview,
    reviewSummary,
    summaryTitle,
  } from "@app/lib/reviewSummary";
  import * as roles from "@app/lib/roles";
  import { push, routeToPath } from "@app/lib/router";
  import {
    authorForNodeId,
    defaultBranch,
    pluralize,
    publicKeyFromDid,
    unqualifyBranch,
    verdictIcon,
  } from "@app/lib/utils";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import AssigneeInput from "@app/components/AssigneeInput.svelte";
  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IdChip from "@app/components/IdChip.svelte";
  import LabelInput from "@app/components/LabelInput.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  interface Props {
    config: Config;
    loadPatch: () => Promise<void>;
    patch: Patch;
    repo: RepoInfo;
    revisions: Revision[];
    stats?: Stats;
    // The tab the review is opened from, so its back button returns there.
    view?: PatchView;
    onShowChanges?: () => void;
  }

  const {
    config,
    loadPatch,
    patch,
    repo,
    revisions,
    stats,
    view,
    onShowChanges,
  }: Props = $props();

  // Shared with the patch list so both summaries say the same thing — the
  // counting, ordering and outdated rules all live in `reviewSummary`.
  const summary = $derived(
    reviewSummary(
      entriesFromRevisions(
        revisions,
        repo.delegates.map(d => d.did),
      ),
      revisions.length,
    ),
  );
  const reviews = $derived(summary.reviews);
  const reviewAuthors = $derived(summary.authors);

  // Which revision a review is of only matters when the patch has more than
  // one revision; with a single revision the whole indicator is hidden.
  const showRevision = $derived(revisions.length > 1);

  let reviewersPopoverExpanded = $state(false);

  // `ReviewEntry.reviewId` is optional because the patch list has no review to
  // link to; every entry built from revisions here carries one.
  function openReview(reviewId: string | undefined) {
    if (!reviewId) return;
    reviewersPopoverExpanded = false;
    closeFocused();
    void push({
      resource: "repo.patch",
      rid: repo.rid,
      patch: patch.id,
      status: undefined,
      reviewId,
      view,
    });
  }

  let labelSaveInProgress: boolean = $state(false);
  let assigneesSaveInProgress: boolean = $state(false);

  async function saveLabels(labels: string[]) {
    try {
      labelSaveInProgress = true;
      await invoke("edit_patch", {
        rid: repo.rid,
        cobId: patch.id,
        action: {
          type: "label",
          labels,
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Editing labels failed", error);
    } finally {
      labelSaveInProgress = false;
      await loadPatch();
    }
  }

  async function saveAssignees(assignees: Author[]) {
    try {
      assigneesSaveInProgress = true;
      await invoke("edit_patch", {
        rid: repo.rid,
        cobId: patch.id,
        action: {
          type: "assign",
          assignees,
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Editing assignees failed", error);
    } finally {
      assigneesSaveInProgress = false;
      await loadPatch();
    }
  }

  const targetBranch = $derived(
    patch.targetBranch === undefined
      ? undefined
      : unqualifyBranch(patch.targetBranch),
  );
  const targetBranchCaption = $derived(
    `This patch merges into ${targetBranch}`,
  );

  // A patch's target is not validated when it is opened, so it can name a
  // branch the source view cannot resolve. The default branch is canonical by
  // definition; any other target needs the canonical ref list, which is
  // expensive enough to load after render. An unresolved target renders
  // unlinked — a missing link beats one that errors.
  const targetIsDefaultBranch = $derived(
    targetBranch !== undefined && targetBranch === defaultBranch(repo),
  );

  let canonicalBranches: Record<string, string> | undefined = $state();
  let canonicalBranchesRid: string | undefined;

  $effect(() => {
    if (targetBranch === undefined || targetIsDefaultBranch) {
      return;
    }
    const requested = repo.rid;
    if (canonicalBranchesRid === requested) {
      return;
    }
    canonicalBranchesRid = requested;
    canonicalBranches = undefined;
    void invoke<RepoRefs>("list_repo_refs", { rid: requested })
      .then(refs => {
        if (canonicalBranchesRid === requested) {
          canonicalBranches = refs.canonical.branches;
        }
      })
      .catch(error => {
        if (canonicalBranchesRid === requested) {
          canonicalBranchesRid = undefined;
        }
        console.error("Failed to load repo refs", error);
      });
  });

  const targetBranchBrowsable = $derived(
    targetIsDefaultBranch ||
      (targetBranch !== undefined &&
        canonicalBranches !== undefined &&
        targetBranch in canonicalBranches),
  );
</script>

<style>
  .meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
  }
  .stats {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  .stats.stats-button {
    cursor: pointer;
  }
  .stats.stats-button:hover,
  .stats.stats-button:focus-visible {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .stats .insertions {
    color: var(--color-feedback-success-text);
  }
  .stats .deletions {
    color: var(--color-feedback-error-text);
  }
  .reviews {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-tertiary);
    cursor: pointer;
    font: var(--txt-body-m-regular);
  }
  .reviews:hover,
  .reviews:focus-visible {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .reviewer-stack {
    display: inline-flex;
    align-items: center;
  }
  .reviewer-stack :global(img) {
    outline: 1px solid var(--color-surface-canvas);
    margin-left: -0.375rem;
  }
  .reviewer-stack :global(img:first-child) {
    margin-left: 0;
  }
  .reviewer-overflow {
    margin-left: 0.25rem;
    color: var(--color-text-tertiary);
  }
  .verdict-accept {
    color: var(--color-feedback-success-text);
  }
  .verdict-reject {
    color: var(--color-feedback-error-text);
  }
  /* Matches the patch list: the whole chip recedes instead of spelling it out,
     with the tooltip carrying the detail. */
  .reviews.outdated {
    color: var(--color-text-quaternary);
  }
  .reviews .outdated {
    color: var(--color-text-quaternary);
  }
  .delegate-badge {
    display: inline-flex;
    align-items: center;
    color: var(--color-text-brand);
  }
  .target-branch-chip,
  .author-chip {
    display: inline-flex;
    align-items: center;
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  .target-group {
    display: inline-flex;
    align-items: center;
    height: 2rem;
    overflow: hidden;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  .target-group .target-branch-chip {
    height: 100%;
    border: 0;
    border-radius: 0;
    background: none;
  }
  .target-arrow {
    display: inline-flex;
    align-items: center;
  }
  .target-branch-chip {
    gap: 0.375rem;
    text-decoration: none;
  }
  a.target-branch-chip:hover,
  a.target-branch-chip:focus-visible {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
</style>

<div class="meta-row">
  <div class="author-chip" title="Patch author">
    <NodeId {...authorForNodeId(patch.author)} />
  </div>
  <div class="target-group">
    <IdChip id={patch.id} label="patch ID" grouped />
    {#if targetBranch}
      <span class="target-arrow" title={targetBranchCaption}>
        <Icon name="arrow-right" />
      </span>
      {#if targetBranchBrowsable}
        <a
          class="target-branch-chip"
          title={targetBranchCaption}
          href={routeToPath({
            resource: "repo.home",
            rid: repo.rid,
            revision: targetBranch,
          })}>
          <Icon name="branch" />
          <span>{targetBranch}</span>
        </a>
      {:else}
        <span class="target-branch-chip" title={targetBranchCaption}>
          <Icon name="branch" />
          <span>{targetBranch}</span>
        </span>
      {/if}
    {/if}
  </div>
  {#if stats}
    {#if onShowChanges}
      <button
        type="button"
        class="stats stats-button"
        onclick={onShowChanges}
        title="View changed files">
        <Icon name="diff" />
        <span>
          {stats.filesChanged}
          {pluralize("file", stats.filesChanged)}
        </span>
        <span class="insertions">+{stats.insertions}</span>
        <span class="deletions">-{stats.deletions}</span>
      </button>
    {:else}
      <div class="stats">
        <Icon name="diff" />
        <span>
          {stats.filesChanged}
          {pluralize("file", stats.filesChanged)}
        </span>
        <span class="insertions">+{stats.insertions}</span>
        <span class="deletions">-{stats.deletions}</span>
      </div>
    {/if}
  {/if}
  {#if reviews.length > 0}
    {@const hasReject = summary.hasReject}
    {@const allAccept = summary.allAccept}
    {#snippet reviewsButton(
      onclick: (() => void) | undefined,
      single?: ReviewEntry,
    )}
      <button
        type="button"
        class="reviews"
        class:outdated={summary.outdated}
        {onclick}
        aria-haspopup={reviews.length > 1 ? "menu" : undefined}
        aria-expanded={reviews.length > 1
          ? reviewersPopoverExpanded
          : undefined}
        title={summaryTitle(summary)}>
        <span class:verdict-accept={allAccept} class:verdict-reject={hasReject}>
          <Icon
            name={summary.outdated
              ? "clock"
              : hasReject
                ? "stop"
                : allAccept
                  ? "thumbs-up"
                  : "comment"} />
        </span>
        <span>
          {reviews.length}
          {pluralize("review", reviews.length)}
          {#if single && showRevision}
            of Revision {single.revisionNumber} of {revisions.length}
          {/if}
        </span>
        {#if summary.outdated && !(single && showRevision)}
          <!-- Skipped when the single-review case above already names the
               revision, which would otherwise say it twice. -->
          <span class="outdated">· r{summary.latestReviewedRevision}</span>
        {/if}
        <span class="reviewer-stack">
          {#each reviewAuthors.slice(0, 3) as author (author.did)}
            <UserAvatar
              nodeId={publicKeyFromDid(author.did)}
              styleWidth="1.125rem" />
          {/each}
          {#if reviewAuthors.length > 3}
            <span class="reviewer-overflow">+{reviewAuthors.length - 3}</span>
          {/if}
        </span>
      </button>
    {/snippet}
    <div class="reviewers-compact">
      {#if reviews.length === 1}
        {@render reviewsButton(
          () => openReview(reviews[0].reviewId),
          reviews[0],
        )}
      {:else}
        <Popover
          popoverPadding="0"
          placement="bottom-start"
          bind:expanded={reviewersPopoverExpanded}>
          {#snippet toggle(onclick)}
            {@render reviewsButton(onclick)}
          {/snippet}
          {#snippet popover()}
            <div
              style:border="1px solid var(--color-border-subtle)"
              style:border-radius="var(--border-radius-sm)"
              style:background-color="var(--color-surface-canvas)">
              <DropdownList items={reviews}>
                {#snippet item(reviewer)}
                  <DropdownListItem
                    selected={false}
                    styleGap="0.5rem"
                    onclick={() => openReview(reviewer.reviewId)}>
                    <span
                      class:verdict-accept={reviewer.verdict === "accept"}
                      class:verdict-reject={reviewer.verdict === "reject"}>
                      <Icon name={verdictIcon(reviewer.verdict)} />
                    </span>
                    <NodeId {...authorForNodeId(reviewer.author)} />
                    {#if reviewer.delegate}
                      <span class="delegate-badge" title="Delegate">
                        <Icon name="badge" />
                      </span>
                    {/if}
                    {#if showRevision}
                      <span
                        style:margin-left="auto"
                        style:color="var(--color-text-quaternary)">
                        Revision {reviewer.revisionNumber} of {revisions.length}
                        {#if isOutdatedReview(reviewer, revisions.length)}
                          · outdated
                        {/if}
                      </span>
                    {/if}
                  </DropdownListItem>
                {/snippet}
              </DropdownList>
            </div>
          {/snippet}
        </Popover>
      {/if}
    </div>
  {/if}
  <LabelInput
    allowedToEdit={!!roles.isDelegate(
      config.publicKey,
      repo.delegates.map(delegate => delegate.did),
    )}
    labels={patch.labels}
    submitInProgress={labelSaveInProgress}
    save={saveLabels} />
  <AssigneeInput
    delegates={repo.delegates}
    allowedToEdit={!!roles.isDelegate(
      config.publicKey,
      repo.delegates.map(delegate => delegate.did),
    )}
    assignees={patch.assignees}
    submitInProgress={assigneesSaveInProgress}
    save={saveAssignees} />
</div>
