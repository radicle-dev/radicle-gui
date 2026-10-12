<script lang="ts">
  import type { Review } from "@bindings/cob/patch/Review";
  import type { CodeLocation } from "@bindings/cob/thread/CodeLocation";

  import { untrack } from "svelte";
  import { backOut, cubicIn } from "svelte/easing";
  import { fly } from "svelte/transition";

  import type { DraftReview } from "@app/lib/draftReviewStorage";
  import { draftReviewStorage } from "@app/lib/draftReviewStorage";
  import { formatAnchor } from "@app/lib/pierreComments";
  import { isPublishableReview, verdictBadge } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";
  import { closeFocused } from "@app/components/Popover.svelte";

  interface Props {
    draftReview: DraftReview;
    filesChecked?: number;
    filesTotal?: number;
    // The protocol keeps one review per author per revision and silently
    // ignores a second one, which would discard this draft without a trace.
    alreadyReviewed?: boolean;
    onChange: () => Promise<void>;
    onPublish: (revisionId: string) => Promise<void>;
    onCancel: () => void;
    // Scroll the diff to a pending comment. Absent where there is no diff to
    // scroll, in which case the location reads as plain text.
    onSelectComment?: (comment: DraftReview["comments"][number]) => void;
  }

  const {
    draftReview,
    filesChecked,
    filesTotal,
    alreadyReviewed = false,
    onChange,
    onPublish,
    onCancel,
    onSelectComment,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let summary = $state(draftReview.summary ?? "");
  // No fallback: `create` records the starting verdict, so an absent one means
  // the reviewer chose "Comment". Defaulting here would undo that and write
  // "accept" back the next time the summary is saved.
  // svelte-ignore state_referenced_locally
  let verdict: Review["verdict"] = $state(draftReview.verdict);
  let publishing = $state(false);
  let dropdownExpanded = $state(false);
  let discardMenuExpanded = $state(false);
  let summaryEl: HTMLTextAreaElement | undefined = $state();

  // Switching between two revisions that both have a draft swaps the prop
  // without remounting, so the fields have to follow it. Keyed on the id, not
  // the object: saving reloads the patch and hands over a fresh object for the
  // same draft, which must not clobber what is being typed.
  let syncedDraftId: string | undefined;
  $effect(() => {
    const id = draftReview.id;
    if (id === syncedDraftId) return;
    syncedDraftId = id;
    untrack(() => {
      summary = draftReview.summary ?? "";
      verdict = draftReview.verdict;
      // Transient UI belongs to the draft that opened it.
      dropdownExpanded = false;
      discardMenuExpanded = false;
      confirmDeleteId = undefined;
    });
  });

  const expanded = $derived(summary.includes("\n") || summary.length > 80);

  function autoResizeSummary() {
    if (!summaryEl) return;
    summaryEl.style.height = "auto";
    summaryEl.style.height = `${summaryEl.scrollHeight}px`;
  }

  $effect(() => {
    void summary;
    void expanded;
    autoResizeSummary();
  });

  type VerdictOption = {
    value: Review["verdict"];
    label: string;
    description: string;
  };

  // Wording follows the protocol: a verdict is advisory. Nothing in
  // `Patch::authorization` consults verdicts when a merge is attempted, so
  // neither option may claim to gate one.
  const verdictOptions: VerdictOption[] = [
    {
      value: "accept",
      label: "Accept revision",
      description: "Record your approval of this revision.",
    },
    {
      value: "reject",
      label: "Reject revision",
      description: "Record your objection to this revision.",
    },
    {
      value: undefined,
      label: "Comment",
      description: "Leave feedback without accepting or rejecting.",
    },
  ];

  const pendingComments = $derived(
    draftReview.comments.filter(c => !c.replyTo),
  );
  const pendingCommentCount = $derived(pendingComments.length);

  let showCommentsTooltip = $state(false);
  let hideTooltipTimer: ReturnType<typeof setTimeout> | undefined;
  let editingCommentId: string | undefined = $state();
  let editBody = $state("");

  function openTooltip() {
    if (hideTooltipTimer) {
      clearTimeout(hideTooltipTimer);
      hideTooltipTimer = undefined;
    }
    showCommentsTooltip = true;
  }
  function scheduleHideTooltip() {
    if (editingCommentId) return;
    if (hideTooltipTimer) clearTimeout(hideTooltipTimer);
    hideTooltipTimer = setTimeout(() => {
      showCommentsTooltip = false;
    }, 150);
  }

  function startEdit(commentId: string, currentBody: string) {
    editingCommentId = commentId;
    editBody = currentBody;
  }
  function cancelEdit() {
    editingCommentId = undefined;
    editBody = "";
  }
  async function saveEdit(commentId: string) {
    draftReviewStorage.updateComment(draftReview.id, commentId, {
      body: editBody,
    });
    editingCommentId = undefined;
    editBody = "";
    await onChange();
  }
  async function deleteComment(commentId: string) {
    draftReviewStorage.deleteComment(draftReview.id, commentId);
    if (editingCommentId === commentId) cancelEdit();
    await onChange();
  }

  let confirmDeleteId: string | undefined = $state();
  let confirmDeleteTimer: ReturnType<typeof setTimeout> | undefined;
  function requestDeleteComment(commentId: string) {
    if (confirmDeleteId === commentId) {
      if (confirmDeleteTimer) clearTimeout(confirmDeleteTimer);
      confirmDeleteId = undefined;
      void deleteComment(commentId);
    } else {
      confirmDeleteId = commentId;
      if (confirmDeleteTimer) clearTimeout(confirmDeleteTimer);
      confirmDeleteTimer = setTimeout(
        () => (confirmDeleteId = undefined),
        3000,
      );
    }
  }

  function formatLocation(location: CodeLocation | undefined): string {
    return location ? formatAnchor(location) : "";
  }

  const verdictLabel = $derived(
    verdictOptions.find(option => option.value === verdict)?.label,
  );
  const verdictColorClass = $derived(verdictBadge(verdict).variant);

  async function persistSummary() {
    draftReviewStorage.update(draftReview.id, {
      summary,
      verdict,
      labels: draftReview.labels,
    });
    await onChange();
  }

  let publishError: string | undefined = $state();

  async function publish() {
    publishing = true;
    publishError = undefined;
    try {
      draftReviewStorage.update(draftReview.id, {
        summary,
        verdict,
        labels: draftReview.labels,
      });
      const revisionId = draftReview.revisionId;
      await draftReviewStorage.publish(draftReview.id);
      await onPublish(revisionId);
    } catch (error) {
      // The draft is only discarded once the review is on the network, so
      // everything typed is still here to retry with.
      console.error("Publishing review failed", error);
      publishError =
        error instanceof Error
          ? error.message
          : "Publishing the review failed.";
    } finally {
      publishing = false;
    }
  }

  const publishDisabled = $derived(
    publishing || alreadyReviewed || !isPublishableReview(verdict, summary),
  );
  const summaryRequired = $derived(verdict === undefined);
</script>

<style>
  .bar {
    flex-shrink: 0;
    margin: 0 1rem 1rem;
    background-color: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    box-shadow: var(--elevation-low);
    padding: 1rem;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 1.5rem;
  }
  .bar.expanded {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }
  .summary {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    background: transparent;
    border: 0;
    outline: none;
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    padding: 0.25rem 0;
    resize: none;
    overflow-y: auto;
    line-height: 1.4;
    max-height: 12rem;
  }
  .bar.expanded .summary {
    flex: 0 1 auto;
    width: 100%;
  }
  .summary::placeholder {
    color: var(--color-text-quaternary);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text-quaternary);
    font: var(--txt-body-m-regular);
  }
  .chip {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0.125rem 0.5rem;
    color: var(--color-text-primary);
  }
  .saved-count {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .comments-tooltip {
    position: absolute;
    bottom: 100%;
    right: 0;
    left: auto;
    z-index: 10;
    width: min(28rem, calc(100vw - 2rem));
    max-height: 24rem;
    overflow-y: auto;
    background-color: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    box-shadow: var(--elevation-low);
    padding: 0.5rem 0;
    margin-bottom: 0.5rem;
  }
  .comments-tooltip::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    height: 0.5rem;
  }
  .comments-tooltip-header {
    padding: 0.25rem 0.75rem 0.5rem;
    color: var(--color-text-tertiary);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .comments-tooltip-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .comments-tooltip-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .comments-tooltip-item:last-child {
    border-bottom: none;
  }
  .comments-tooltip-item-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.25rem;
  }
  .comments-tooltip-location {
    color: var(--color-text-tertiary);
    font-family: var(--font-family-monospace);
    overflow-wrap: anywhere;
    flex: 1 1 auto;
    min-width: 0;
  }
  button.comments-tooltip-location.is-link {
    background: none;
    border: 0;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }
  button.comments-tooltip-location.is-link:hover,
  button.comments-tooltip-location.is-link:focus-visible {
    color: var(--color-text-primary);
    text-decoration: underline;
  }
  .comments-tooltip-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: auto;
    opacity: 0;
    transition: opacity 100ms ease;
  }
  .comments-tooltip-item:hover .comments-tooltip-actions,
  .comments-tooltip-item:focus-within .comments-tooltip-actions {
    opacity: 1;
  }
  .comments-tooltip-action {
    background: none;
    border: 1px solid transparent;
    cursor: pointer;
    color: var(--color-text-tertiary);
    padding: 0.125rem;
    border-radius: var(--border-radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .comments-tooltip-action:hover,
  .comments-tooltip-action:focus-visible {
    color: var(--color-text-primary);
    background-color: var(--color-surface-subtle);
  }
  .comments-tooltip-action.confirming {
    color: var(--color-feedback-error-text);
    background-color: var(--color-feedback-error-bg);
  }
  .comments-tooltip-body {
    color: var(--color-text-primary);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .comments-tooltip-edit {
    width: 100%;
    box-sizing: border-box;
    background-color: var(--color-surface-subtle);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    outline: none;
    color: var(--color-text-primary);
    font: inherit;
    padding: 0.25rem 0.5rem;
    resize: vertical;
  }
  .comments-tooltip-edit:focus {
    border-color: var(--color-border-default);
  }
  .comments-tooltip-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.25rem;
  }
  .split-button {
    display: flex;
    align-items: stretch;
    gap: 0.25rem;
  }
  .publish-wrap {
    display: inline-flex;
  }
  .verdict-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border: none;
    border-radius: var(--border-radius-sm);
    height: 2rem;
    padding: 0 0.5rem;
    cursor: pointer;
    white-space: nowrap;
    -webkit-user-select: none;
    user-select: none;
    transition: background-color 0.1s ease;
    color: var(--color-text-on-brand);
  }
  .verdict-btn:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .publish-error {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    white-space: nowrap;
    color: var(--color-feedback-error-text);
  }
  .verdict-btn.accept {
    background-color: var(--color-feedback-success-fill);
  }
  .verdict-btn.accept:hover:not(:disabled) {
    background-color: var(--color-feedback-success-fill-hover);
  }
  .verdict-btn.accept:active:not(:disabled),
  .verdict-btn.accept.active:not(:disabled) {
    background-color: var(--color-feedback-success-fill-active);
  }
  .verdict-btn.reject {
    background-color: var(--color-feedback-error-fill);
  }
  .verdict-btn.reject:hover:not(:disabled) {
    background-color: var(--color-feedback-error-fill-hover);
  }
  .verdict-btn.reject:active:not(:disabled),
  .verdict-btn.reject.active:not(:disabled) {
    background-color: var(--color-feedback-error-fill-active);
  }
  .verdict-btn.comment {
    background-color: var(--color-surface-brand-secondary);
  }
  .verdict-btn.comment:active:not(:disabled),
  .verdict-btn.comment.active:not(:disabled) {
    background-color: var(--color-surface-brand-primary);
  }
  .verdict-btn.caret {
    width: 2rem;
    padding: 0;
  }
  .verdict-menu {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    width: 22rem;
    overflow: hidden;
  }
  .verdict-option {
    display: grid;
    grid-template-columns: 1.5rem 1fr;
    column-gap: 0.5rem;
    align-items: start;
    padding: 0.625rem 0.75rem;
    cursor: pointer;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .verdict-option:last-child {
    border-bottom: none;
  }
  .verdict-option:hover {
    background-color: var(--color-surface-subtle);
  }
  .verdict-check {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 1.25rem;
    color: var(--color-text-primary);
  }
  .verdict-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .verdict-label {
    font: var(--txt-body-m-medium);
    color: var(--color-text-primary);
  }
  .verdict-description {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    white-space: normal;
  }
  .confirm-discard {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    min-width: 16rem;
  }
  .confirm-discard-text {
    color: var(--color-text-primary);
  }
  .confirm-discard-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .confirm-discard-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 2rem;
    padding: 0 0.75rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-feedback-error-fill);
    color: var(--color-text-on-brand);
    cursor: pointer;
    transition: background-color 0.1s ease;
  }
  .confirm-discard-button:hover:not(:disabled),
  .confirm-discard-button:focus-visible:not(:disabled) {
    background-color: var(--color-feedback-error-fill-hover);
  }
  .confirm-discard-button:active:not(:disabled) {
    background-color: var(--color-feedback-error-fill-active);
  }
  .confirm-discard-button:disabled {
    cursor: default;
    opacity: 0.6;
  }
</style>

<div
  class="bar"
  class:expanded
  in:fly={{ y: 120, duration: 260, easing: backOut }}
  out:fly={{ y: 120, duration: 180, easing: cubicIn }}>
  <textarea
    bind:this={summaryEl}
    class="summary"
    rows="1"
    placeholder={summaryRequired
      ? "Add a review summary"
      : "Add an optional review summary"}
    bind:value={summary}
    oninput={autoResizeSummary}
    onblur={persistSummary}>
  </textarea>

  <div class="actions">
    <div class="status">
      {#if publishError}
        <span class="publish-error" title={publishError}>
          <Icon name="warning" />
          Not published — your draft is safe. Try again.
        </span>
      {:else}
        <span class="chip">Draft saved</span>
      {/if}
      {#if filesTotal !== undefined && filesChecked !== undefined}
        <span class="saved-count" title="Files reviewed in this revision">
          <Icon name="document" />
          {filesChecked}/{filesTotal}
        </span>
      {/if}
      <span
        role="status"
        class="saved-count"
        onmouseenter={openTooltip}
        onmouseleave={scheduleHideTooltip}>
        <Icon name="comment" />
        {pendingCommentCount}
        {#if showCommentsTooltip && pendingCommentCount > 0}
          <div
            class="comments-tooltip"
            onmouseenter={openTooltip}
            onmouseleave={scheduleHideTooltip}
            role="presentation">
            <div class="comments-tooltip-header txt-body-s-medium">
              {pendingCommentCount}
              {pendingCommentCount === 1 ? "comment" : "comments"}
            </div>
            <ul class="comments-tooltip-list">
              {#each pendingComments as comment (comment.id)}
                {@const body =
                  comment.edits[comment.edits.length - 1]?.body ?? ""}
                <li class="comments-tooltip-item">
                  <div class="comments-tooltip-item-header">
                    {#if comment.location}
                      {#if onSelectComment}
                        <button
                          type="button"
                          class="comments-tooltip-location is-link txt-body-s-regular"
                          title="Jump to this comment in the diff"
                          onclick={() => {
                            showCommentsTooltip = false;
                            onSelectComment(comment);
                          }}>
                          {formatLocation(comment.location)}
                        </button>
                      {:else}
                        <div
                          class="comments-tooltip-location txt-body-s-regular">
                          {formatLocation(comment.location)}
                        </div>
                      {/if}
                    {/if}
                    {#if editingCommentId !== comment.id}
                      <div class="comments-tooltip-actions">
                        <button
                          type="button"
                          class="comments-tooltip-action"
                          title="Edit"
                          onclick={() => startEdit(comment.id, body)}>
                          <Icon name="edit" />
                        </button>
                        <button
                          type="button"
                          class="comments-tooltip-action"
                          class:confirming={confirmDeleteId === comment.id}
                          title={confirmDeleteId === comment.id
                            ? "Click again to confirm"
                            : "Delete"}
                          onclick={() => requestDeleteComment(comment.id)}>
                          <Icon
                            name={confirmDeleteId === comment.id
                              ? "checkmark"
                              : "trash"} />
                        </button>
                      </div>
                    {/if}
                  </div>
                  {#if editingCommentId === comment.id}
                    <textarea
                      class="comments-tooltip-edit txt-body-m-regular"
                      bind:value={editBody}
                      rows="3">
                    </textarea>
                    <div class="comments-tooltip-edit-actions">
                      <Button variant="outline" onclick={cancelEdit}>
                        Cancel
                      </Button>
                      <Button
                        variant="secondary"
                        onclick={() => saveEdit(comment.id)}>
                        Save
                      </Button>
                    </div>
                  {:else}
                    <div class="comments-tooltip-body txt-body-m-regular">
                      {body}
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </span>
    </div>

    <div style:margin-left="auto" style:display="flex" style:gap="0.5rem">
      <Popover
        popoverPadding="0"
        placement="top-start"
        bind:expanded={discardMenuExpanded}>
        {#snippet toggle(onclick)}
          <Button
            variant="outline"
            disabled={publishing}
            active={discardMenuExpanded}
            {onclick}>
            Discard
          </Button>
        {/snippet}
        {#snippet popover()}
          <div
            style:border="1px solid var(--color-border-subtle)"
            style:border-radius="var(--border-radius-sm)"
            style:background-color="var(--color-surface-canvas)">
            <div class="confirm-discard">
              <div class="confirm-discard-text txt-body-m-regular">
                Discard this draft review? Your comments and verdict will be
                lost.
              </div>
              <div class="confirm-discard-actions">
                <Button
                  variant="outline"
                  disabled={publishing}
                  onclick={() => (discardMenuExpanded = false)}>
                  Cancel
                </Button>
                <button
                  type="button"
                  class="confirm-discard-button txt-body-m-medium"
                  disabled={publishing}
                  onclick={() => {
                    discardMenuExpanded = false;
                    onCancel();
                  }}>
                  <Icon name="trash" />
                  Discard
                </button>
              </div>
            </div>
          </div>
        {/snippet}
      </Popover>

      <div class="split-button">
        <!-- Wrapper carries the title: a disabled <button> won't show one. -->
        <span
          class="publish-wrap"
          title={alreadyReviewed
            ? "You already published a review of this revision, and the protocol keeps one review per author per revision. Comment on the changes directly to add to it."
            : summaryRequired && summary.trim() === ""
              ? "Review summary required"
              : undefined}>
          <button
            class="verdict-btn txt-body-m-medium {verdictColorClass}"
            disabled={publishDisabled}
            onclick={publish}>
            {verdictLabel}
          </button>
        </span>
        <Popover
          popoverPadding="0"
          placement="top-end"
          bind:expanded={dropdownExpanded}>
          {#snippet toggle(onclick)}
            <button
              class="verdict-btn caret {verdictColorClass}"
              class:active={dropdownExpanded}
              disabled={publishing}
              {onclick}>
              <Icon name={dropdownExpanded ? "chevron-up" : "chevron-down"} />
            </button>
          {/snippet}
          {#snippet popover()}
            <div class="verdict-menu">
              {#each verdictOptions as option (option.label)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  role="button"
                  tabindex="0"
                  class="verdict-option"
                  onclick={() => {
                    verdict = option.value;
                    draftReviewStorage.update(draftReview.id, {
                      summary,
                      verdict: option.value,
                      labels: draftReview.labels,
                    });
                    closeFocused();
                    void onChange();
                  }}>
                  <div class="verdict-check">
                    {#if verdict === option.value}
                      <Icon name="checkmark" />
                    {/if}
                  </div>
                  <div class="verdict-text">
                    <span class="verdict-label">{option.label}</span>
                    <span class="verdict-description">
                      {option.description}
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          {/snippet}
        </Popover>
      </div>
    </div>
  </div>
</div>
