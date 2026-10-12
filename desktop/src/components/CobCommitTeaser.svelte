<script lang="ts">
  import type { Commit } from "@bindings/repo/Commit";
  import type { Snippet } from "svelte";

  import { commitTimes, formatTimestamp, twemoji } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import CommitAuthors from "@app/components/CommitAuthors.svelte";
  import CompactCommitAuthorship from "@app/components/CompactCommitAuthorship.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/components/InlineTitle.svelte";

  interface Props {
    children?: Snippet;
    commit: Commit;
    disabled: boolean;
    hoverable?: boolean;
    onclick?: () => void;
    flush?: boolean;
    // Stack the summary above the author/hash/date row, for narrow columns.
    stacked?: boolean;
  }

  const {
    children,
    commit,
    disabled,
    flush = false,
    hoverable = false,
    onclick = undefined,
    stacked = false,
  }: Props = $props();

  let commitMessageVisible = $state(false);
</script>

<style>
  .teaser {
    display: flex;
    font: var(--txt-body-m-regular);
    align-items: start;
    padding: 0.125rem 0;
  }
  .disabled,
  .disabled :global(*) {
    color: var(--color-text-disabled) !important;
  }
  .message {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    -webkit-touch-callout: initial;
    -webkit-user-select: text;
    user-select: text;
  }
  .left {
    display: flex;
    gap: 0.5rem;
    padding: 0 0.5rem;
    flex-direction: column;
  }
  .right {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-left: auto;
    height: 1.3125rem;
  }
  .commit-message {
    font: var(--txt-body-s-regular);
    -webkit-touch-callout: initial;
    -webkit-user-select: text;
    user-select: text;
  }
  .commit-expand-button {
    height: 1.3125rem;
    display: flex;
    align-items: center;
  }
  pre {
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  /* Stacked layout for the narrow commits column. */
  .teaser.stacked {
    flex-direction: column;
    align-items: stretch;
    gap: 0.375rem;
    padding: 0;
  }
  .stacked-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .stacked-header .summary-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stacked-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.375rem 0.5rem;
    min-width: 0;
    font: var(--txt-body-s-regular);
    color: var(--color-text-secondary);
  }
  .stacked-meta .meta-hash {
    margin-left: auto;
  }
  .stacked-meta .meta-hash :global(.txt-id) {
    color: var(--color-text-quaternary);
    /* Keep the monospace family, but match the meta-row font size. */
    font: var(--txt-code-regular);
    font-size: 0.75rem;
    line-height: 1rem;
  }
  .stacked-meta .meta-time {
    white-space: nowrap;
  }
</style>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="teaser"
  class:disabled
  class:stacked
  {onclick}
  aria-label="commit-teaser">
  {#if stacked}
    <div class="stacked-header">
      <CommitAuthors {commit} />
      <div
        class="summary-title"
        style:cursor={hoverable ? "pointer" : "default"}
        use:twemoji>
        {#if !commit.summary}
          <span class="txt-missing">No commit message</span>
        {:else}
          <InlineTitle fontSize="small" content={commit.summary} />
        {/if}
      </div>
    </div>
    <div class="stacked-meta">
      {@render children?.()}
      <span class="meta-hash">
        <Id id={commit.id} clipboard={commit.id} label="commit hash" />
      </span>
      <span class="meta-time" title={commitTimes(commit)}>
        {formatTimestamp(commit.committer.time * 1000)}
      </span>
    </div>
  {:else}
    <div class="left" style:padding={flush ? "0" : undefined}>
      <div class="message">
        <div
          class="summary-title"
          style:cursor={hoverable ? "pointer" : "default"}
          use:twemoji>
          {#if !commit.summary}
            <span class="txt-missing">No commit message</span>
          {:else}
            <InlineTitle fontSize="small" content={commit.summary} />
          {/if}
        </div>
        {#if commit.message.trim() !== commit.summary.trim()}
          <div class="commit-expand-button">
            <Button
              variant="naked"
              stylePadding="0 0.25rem"
              onclick={e => {
                e.stopPropagation();
                commitMessageVisible = !commitMessageVisible;
              }}>
              <Icon name="ellipsis" />
            </Button>
          </div>
        {/if}
      </div>
      {#if commitMessageVisible}
        <div class="commit-message">
          <pre>{commit.message.replace(commit.summary, "").trim()}</pre>
        </div>
      {/if}
    </div>
    <div class="right">
      {@render children?.()}
      <CompactCommitAuthorship {commit}>
        <Id id={commit.id} clipboard={commit.id} label="commit hash" />
      </CompactCommitAuthorship>
    </div>
  {/if}
</div>
