<script lang="ts" module>
  import type { Author } from "@bindings/cob/Author";

  import type { FlattenedPatchOperation } from "@app/lib/patchTimeline";

  export type { FlattenedPatchOperation };
</script>

<script lang="ts">
  import { slide } from "svelte/transition";

  import { itemDiff } from "@app/lib/cobActivity";
  import { cachedConfig, writeToClipboard } from "@app/lib/invoke";
  import { entityUrl } from "@app/lib/mentions";
  import { splitDescription } from "@app/lib/revisionDescription";
  import {
    absoluteTimestamp,
    authorForNodeId,
    formatTimestamp,
    patchStatusColor,
    pluralize,
  } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import ReviewProgressChip from "@app/components/ReviewProgressChip.svelte";

  interface Props {
    op: FlattenedPatchOperation;
    expanded?: boolean;
    onToggle?: () => void;
    hideAuthor?: boolean;
    targetBranch?: string;
    firstRevision?: boolean;
    onViewFullReview?: () => void;
    onOpenReview?: () => void;
    onOpenChanges?: () => void;
    rid?: string;
    patchId?: string;
    latest?: boolean;
    reviewInProgress?: boolean;
    bodyExternal?: boolean;
    openedAsDraft?: boolean;
  }

  const {
    op,
    expanded,
    onToggle,
    hideAuthor,
    targetBranch,
    firstRevision = false,
    onViewFullReview,
    onOpenReview,
    onOpenChanges,
    rid,
    patchId,
    latest = false,
    reviewInProgress = false,
    bodyExternal = false,
    openedAsDraft = false,
  }: Props = $props();

  let copyLinkIcon: "link" | "checkmark" = $state("link");
  async function copyRevisionLink() {
    if (!rid || !patchId) return;
    const config = await cachedConfig();
    // Deep-link to the Changes tab with this revision pre-selected. The
    // revision id goes in the path (`/patches/<patch>/<revision>`), which is
    // the form the explorer resolves; `?revision=` does not navigate there.
    const url = entityUrl(
      { type: "cob", kind: "patch", rid, oid: patchId },
      config,
    );
    if (!url) return;
    await writeToClipboard(`${url}/${op.id}?tab=changes`);
    copyLinkIcon = "checkmark";
    setTimeout(() => (copyLinkIcon = "link"), 1000);
  }
</script>

<style>
  .timeline-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    min-height: 2.5rem;
  }
  .timeline-item:has(.revision-body) {
    align-items: flex-start;
  }
  .timeline-item.toggleable {
    cursor: pointer;
  }
  .timeline-item.toggleable:hover,
  .timeline-item.toggleable:focus-visible {
    background-color: var(--color-surface-subtle);
  }
  .timeline-item.card-header {
    border-radius: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .wrapper {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    flex: 1 1 0;
  }
  .icon {
    padding-top: 0;
  }
  .timeline-item:has(.revision-body) .icon {
    padding-top: 0.1875rem;
  }
  .icon-stack {
    display: grid;
    width: 1rem;
    place-items: center;
  }
  .icon-default,
  .icon-hover {
    grid-area: 1 / 1;
    transition:
      opacity 150ms ease,
      transform 150ms ease;
  }
  .icon-hover {
    opacity: 0;
    transform: rotate(-90deg);
  }
  .timeline-item.toggleable:hover .icon-default,
  .timeline-item.toggleable:focus-visible .icon-default,
  .timeline-item.verdict-toggleable:hover .icon-default,
  .timeline-item.verdict-toggleable:focus-visible .icon-default {
    opacity: 0;
    transform: rotate(90deg);
  }
  .timeline-item.toggleable:hover .icon-hover,
  .timeline-item.toggleable:focus-visible .icon-hover,
  .timeline-item.verdict-toggleable:hover .icon-hover,
  .timeline-item.verdict-toggleable:focus-visible .icon-hover {
    opacity: 1;
    transform: rotate(0);
  }
  .verdict-toggleable {
    cursor: pointer;
  }
  .summary-line {
    display: flex;
    align-items: center;
    flex: 1 1 0;
    min-width: 0;
    gap: 0.25rem;
  }
  .summary-secondary {
    color: var(--color-text-tertiary);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .no-description {
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
  /* Sized like the other badges on this line — the verdict badge in
     `ReviewItem` and `ReviewProgressChip` — so a row carrying several of them
     reads as one set. */
  .latest-chip {
    flex-shrink: 0;
    white-space: nowrap;
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-brand-subtle);
    color: var(--color-text-brand);
  }
  .summary-content {
    color: var(--color-text-primary);
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .timestamp {
    color: var(--color-text-quaternary);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .meta-hash {
    color: var(--color-text-quaternary);
  }
  .meta-hash :global(.txt-id) {
    color: inherit;
  }
  .meta-hash :global(.txt-id:hover) {
    color: inherit;
  }
  .verdict-accept {
    background-color: var(--color-feedback-success-bg);
    color: var(--color-feedback-success-text);
  }
  .verdict-accept,
  .verdict-accept :global(*) {
    color: var(--color-feedback-success-text);
  }
  .verdict-reject {
    background-color: var(--color-feedback-error-bg);
    color: var(--color-feedback-error-text);
  }
  .verdict-reject,
  .verdict-reject :global(*) {
    color: var(--color-feedback-error-text);
  }
  .verdict-comment {
    background-color: var(--color-surface-subtle);
  }
  .revision-body {
    flex-basis: 100%;
    color: var(--color-text-primary);
    overflow-wrap: anywhere;
  }
  .merge-badge {
    background-color: var(--color-surface-brand-subtle);
    color: var(--color-text-brand);
  }
  .merge-badge,
  .merge-badge :global(*) {
    color: inherit;
  }
  .merge-target {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .copy-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--color-text-quaternary);
    cursor: pointer;
  }
  .copy-link:hover,
  .copy-link:focus-visible {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .open-changes {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--color-text-quaternary);
    cursor: pointer;
    opacity: 0;
    transition: opacity 150ms ease;
  }
  .timeline-item:hover .open-changes,
  .open-changes:focus-visible {
    opacity: 1;
  }
  .open-changes:hover,
  .open-changes:focus-visible {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .view-full-review {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    background: none;
    border: 1px solid transparent;
    cursor: pointer;
    color: inherit;
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
    font: inherit;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .view-full-review:hover,
  .view-full-review:focus-visible {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .verdict-accept .view-full-review:hover,
  .verdict-accept .view-full-review:focus-visible {
    background-color: var(--color-surface-canvas);
    color: var(--color-feedback-success-text);
  }
  .verdict-reject .view-full-review:hover,
  .verdict-reject .view-full-review:focus-visible {
    background-color: var(--color-surface-canvas);
    color: var(--color-feedback-error-text);
  }
  .verdict-comment .view-full-review:hover,
  .verdict-comment .view-full-review:focus-visible {
    background-color: var(--color-surface-canvas);
    color: var(--color-text-primary);
  }
</style>

{#snippet viewFullReviewButton()}
  {#if onViewFullReview}
    <button
      type="button"
      class="view-full-review"
      onclick={e => {
        e.stopPropagation();
        onViewFullReview();
      }}>
      View full review
      <Icon name="chevron-right" />
    </button>
  {/if}
{/snippet}

{#snippet copyLinkButton()}
  {#if rid && patchId}
    <button
      type="button"
      class="copy-link"
      title="Copy revision link"
      onclick={e => {
        e.stopPropagation();
        void copyRevisionLink();
      }}>
      <Icon name={copyLinkIcon} />
    </button>
  {/if}
{/snippet}

{#if op.type === "revision"}
  {@const desc = splitDescription(op.description)}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="timeline-item txt-body-m-regular"
    class:toggleable={onToggle !== undefined}
    class:card-header={bodyExternal}
    role={onToggle ? "button" : undefined}
    tabindex={onToggle ? 0 : undefined}
    onclick={onToggle}>
    <div class="icon">
      {#if onToggle}
        <span class="icon-stack">
          <span class="icon-default">
            <Icon name={firstRevision ? "patch" : "revision"} />
          </span>
          <span class="icon-hover">
            <Icon name={expanded ? "collapse-vertical" : "expand-vertical"} />
          </span>
        </span>
      {:else}
        <Icon name={firstRevision ? "patch" : "revision"} />
      {/if}
    </div>
    <div class="wrapper">
      {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
      <div class="summary-line">
        <span class="summary-secondary">
          {firstRevision
            ? openedAsDraft
              ? "opened a draft patch"
              : "opened patch"
            : "created revision"}
        </span>
        {#if !firstRevision}
          {#if desc.subject}
            <span class="txt-body-m-medium summary-content">
              {desc.subject}
            </span>
          {:else}
            <span class="no-description">No description</span>
          {/if}
        {/if}
        {#if latest}
          <span class="latest-chip txt-body-s-medium">Latest</span>
        {/if}
        {#if reviewInProgress}
          <ReviewProgressChip onclick={() => onOpenReview?.()} />
        {/if}
        {#if onOpenChanges}
          <button
            type="button"
            class="open-changes"
            title="Open revision changes"
            onclick={e => {
              e.stopPropagation();
              onOpenChanges();
            }}>
            <Icon name="arrow-right" />
          </button>
        {/if}
      </div>
      <div class="meta">
        {#if !firstRevision}
          <div class="meta-hash">
            <Id id={op.id} clipboard={op.id} label="revision ID" />
          </div>
        {/if}
        <div class="timestamp" title={absoluteTimestamp(op.timestamp)}>
          {formatTimestamp(op.timestamp)}
        </div>
        {#if expanded}
          {@render copyLinkButton()}
        {/if}
      </div>
      {#if !firstRevision && desc.body && expanded && !bodyExternal}
        <div class="revision-body" transition:slide={{ duration: 180 }}>
          <Markdown {rid} breaks content={desc.body} />
        </div>
      {/if}
    </div>
  </div>
{:else if op.type === "lifecycle"}
  <div class="timeline-item txt-body-m-regular">
    <div class="icon" style:color={patchStatusColor[op.state.status]}>
      <Icon
        name={op.state.status === "open"
          ? "patch"
          : `patch-${op.state.status}`} />
    </div>
    <div class="wrapper">
      {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
      <div class="summary-line">
        <span class="summary-secondary">
          {#if op.state.status === "draft"}
            converted patch to draft
          {:else if op.state.status === "archived"}
            archived patch
          {:else if op.state.status === "open"}
            {#if op.previous?.type === "lifecycle" && op.previous.state.status === "draft"}
              marked patch ready to review
            {:else}
              reopened patch
            {/if}
          {/if}
        </span>
      </div>
      <div class="meta">
        <div class="timestamp" title={absoluteTimestamp(op.timestamp)}>
          {formatTimestamp(op.timestamp)}
        </div>
      </div>
    </div>
  </div>
{:else if op.type === "label"}
  <div class="timeline-item txt-body-m-regular">
    <div class="icon">
      <Icon name="label" />
    </div>
    <div class="wrapper">
      {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
      <div class="summary-line">
        {#if op.previous && op.previous.type === op.type}
          {@const changed = itemDiff(op.previous?.labels ?? [], op.labels)}
          {#if changed.added.length || changed.removed.length}
            {#if changed.added.length}
              <span class="summary-secondary">
                added {pluralize("label", changed.added.length)}
              </span>
              {#each changed.added as label}
                <b class="summary-content">{label}</b>
              {/each}
            {/if}
            {#if changed.removed.length}
              <span class="summary-secondary">
                removed {pluralize("label", changed.removed.length)}
              </span>
              {#each changed.removed as label}
                <b class="summary-content">{label}</b>
              {/each}
            {/if}
          {/if}
        {:else}
          <span class="summary-secondary">
            added {pluralize("label", op.labels.length)}
          </span>
          {#each op.labels as label}
            <b class="summary-content">{label}</b>
          {/each}
        {/if}
      </div>
      <div class="meta">
        <div class="timestamp" title={absoluteTimestamp(op.timestamp)}>
          {formatTimestamp(op.timestamp)}
        </div>
      </div>
    </div>
  </div>
{:else if op.type === "assign"}
  <div class="timeline-item txt-body-m-regular">
    <div class="icon">
      <Icon name="avatar-incognito" />
    </div>
    <div class="wrapper">
      {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
      <div class="summary-line">
        {#if op.previous && op.previous.type === op.type}
          {@const changed = itemDiff<Author>(
            op.previous?.assignees ?? [],
            op.assignees,
            assignee => assignee.did,
          )}
          {#if changed.added.length}
            <span class="summary-secondary">assigned</span>
            {#each changed.added as assignee}
              <NodeId {...authorForNodeId(assignee)} />
            {/each}
          {/if}
          {#if changed.removed.length}
            <span class="summary-secondary">unassigned</span>
            {#each changed.removed as assignee}
              <NodeId {...authorForNodeId(assignee)} />
            {/each}
          {/if}
        {:else}
          <span class="txt-body-m-medium">assigned</span>
          {#each op.assignees as assignee}
            <NodeId {...authorForNodeId(assignee)} />
          {/each}
        {/if}
      </div>
      <div class="meta">
        <div class="timestamp" title={absoluteTimestamp(op.timestamp)}>
          {formatTimestamp(op.timestamp)}
        </div>
      </div>
    </div>
  </div>
{:else if op.type === "merge"}
  <div class="timeline-item txt-body-m-regular merge-badge">
    <div class="icon" style:color="var(--color-text-brand)">
      <Icon name="patch-merged" />
    </div>
    <div class="wrapper">
      {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
      <div class="summary-line">
        <span class="txt-body-m-medium">merged patch</span>
        {#if targetBranch}
          into
          <span class="merge-target">
            <Icon name="branch" />
            {targetBranch}
          </span>
        {/if}
      </div>
      <div class="meta">
        <Id id={op.revision} clipboard={op.revision} label="revision ID" />
        <div class="timestamp" title={absoluteTimestamp(op.timestamp)}>
          {formatTimestamp(op.timestamp)}
        </div>
      </div>
    </div>
  </div>
{:else if op.type === "edit"}
  {#if op.previous && op.previous.type === op.type}
    <div class="timeline-item txt-body-m-regular">
      <div class="icon">
        <Icon name="edit" />
      </div>
      <div class="wrapper">
        {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
        <div class="summary-line">
          <span class="summary-secondary">changed title</span>
          <s class="summary-secondary">{op.previous.title}</s>
          <span class="summary-secondary">→</span>
          <span class="txt-body-m-medium summary-content">{op.title}</span>
        </div>
        <div class="meta">
          <div class="timestamp" title={absoluteTimestamp(op.timestamp)}>
            {formatTimestamp(op.timestamp)}
          </div>
        </div>
      </div>
    </div>
  {/if}
{:else if op.type === "review"}
  {@const reviewSummary = splitDescription(op.summary ?? "")}
  {@const isToggleable = onToggle !== undefined}
  {#if op.verdict === "accept"}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="timeline-item txt-body-m-regular verdict-accept"
      class:verdict-toggleable={isToggleable}
      role={isToggleable ? "button" : undefined}
      tabindex={isToggleable ? 0 : undefined}
      onclick={isToggleable ? onToggle : undefined}>
      <div class="icon" style:color="var(--color-feedback-success-text)">
        {#if isToggleable}
          <span class="icon-stack">
            <span class="icon-default"><Icon name="thumbs-up" /></span>
            <span class="icon-hover">
              <Icon name={expanded ? "collapse-vertical" : "expand-vertical"} />
            </span>
          </span>
        {:else}
          <Icon name="thumbs-up" />
        {/if}
      </div>
      <div class="wrapper">
        {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
        <div class="summary-line">
          <span class="summary-secondary">accepted revision</span>
          {#if reviewSummary.subject}
            <span class="txt-body-m-medium summary-content">
              {reviewSummary.subject}
            </span>
          {/if}
          {@render viewFullReviewButton()}
        </div>
        <div class="meta">
          <Id id={op.revision} clipboard={op.revision} label="revision ID" />
          <div class="timestamp" title={absoluteTimestamp(op.timestamp)}>
            {formatTimestamp(op.timestamp)}
          </div>
        </div>
      </div>
    </div>
  {:else if op.verdict === "reject"}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="timeline-item txt-body-m-regular verdict-reject"
      class:verdict-toggleable={isToggleable}
      role={isToggleable ? "button" : undefined}
      tabindex={isToggleable ? 0 : undefined}
      onclick={isToggleable ? onToggle : undefined}>
      <div class="icon" style:color="var(--color-feedback-error-text)">
        {#if isToggleable}
          <span class="icon-stack">
            <span class="icon-default"><Icon name="stop" /></span>
            <span class="icon-hover">
              <Icon name={expanded ? "collapse-vertical" : "expand-vertical"} />
            </span>
          </span>
        {:else}
          <Icon name="stop" />
        {/if}
      </div>
      <div class="wrapper">
        {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
        <div class="summary-line">
          <span class="summary-secondary">rejected revision</span>
          {#if reviewSummary.subject}
            <span class="txt-body-m-medium summary-content">
              {reviewSummary.subject}
            </span>
          {/if}
          {@render viewFullReviewButton()}
        </div>
        <div class="meta">
          <Id id={op.revision} clipboard={op.revision} label="revision ID" />
          <div class="timestamp" title={absoluteTimestamp(op.timestamp)}>
            {formatTimestamp(op.timestamp)}
          </div>
        </div>
      </div>
    </div>
  {:else if op.verdict === undefined}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="timeline-item txt-body-m-regular verdict-comment"
      class:verdict-toggleable={isToggleable}
      role={isToggleable ? "button" : undefined}
      tabindex={isToggleable ? 0 : undefined}
      onclick={isToggleable ? onToggle : undefined}>
      <div class="icon">
        {#if isToggleable}
          <span class="icon-stack">
            <span class="icon-default"><Icon name="comment" /></span>
            <span class="icon-hover">
              <Icon name={expanded ? "collapse-vertical" : "expand-vertical"} />
            </span>
          </span>
        {:else}
          <Icon name="comment" />
        {/if}
      </div>
      <div class="wrapper">
        {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
        <div class="summary-line">
          <span class="summary-secondary">reviewed revision</span>
          {#if reviewSummary.subject}
            <span class="txt-body-m-medium summary-content">
              {reviewSummary.subject}
            </span>
          {/if}
          {@render viewFullReviewButton()}
        </div>
        <div class="meta">
          <Id id={op.revision} clipboard={op.revision} label="revision ID" />
          <div class="timestamp" title={absoluteTimestamp(op.timestamp)}>
            {formatTimestamp(op.timestamp)}
          </div>
        </div>
      </div>
    </div>
  {/if}
{/if}
