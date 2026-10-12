<script lang="ts">
  import type { Commit } from "@bindings/repo/Commit";

  import { commitTimes, formatTimestamp } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";

  interface Props {
    commit: Commit;
    hideAuthor?: boolean;
  }

  const { commit, hideAuthor }: Props = $props();

  const committedAt = $derived(commit.committer.time * 1000);
</script>

<style>
  .timeline-item {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr);
    column-gap: 0.5rem;
    align-items: center;
    min-width: 0;
    padding: 0.375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    min-height: 2.5rem;
  }
  .wrapper {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    min-width: 0;
    flex: 1 1 0;
  }
  .icon {
    width: 1rem;
    color: var(--color-text-secondary);
  }
  .author {
    color: var(--color-text-tertiary);
  }
  .summary-line {
    flex: 1 1 0;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .action-verb {
    color: var(--color-text-tertiary);
  }
  .summary-content {
    color: var(--color-text-primary);
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
</style>

<div class="timeline-item txt-body-m-regular">
  <div class="icon">
    <Icon name="commit" />
  </div>
  <div class="wrapper">
    {#if !hideAuthor}
      <span class="author">{commit.author.name}</span>
    {/if}
    <div class="summary-line">
      {#if !hideAuthor}
        <span class="action-verb">committed</span>
      {/if}
      <span class="txt-body-m-medium summary-content">{commit.summary}</span>
    </div>
    <div class="meta">
      <div class="meta-hash">
        <Id id={commit.id} clipboard={commit.id} label="commit hash" />
      </div>
      <div class="timestamp" title={commitTimes(commit)}>
        {formatTimestamp(committedAt)}
      </div>
    </div>
  </div>
</div>
