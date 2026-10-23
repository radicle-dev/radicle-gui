<script lang="ts">
  import type { Activity } from "@app/lib/activity";

  import { timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import Icon from "./Icon.svelte";

  interface Props {
    items: Activity[];
  }

  const { items }: Props = $props();

  const icons = {
    commit: "commit",
    issue: "issue",
    patch: "patch",
    review: "comment-checkmark",
    comment: "comment",
    release: "parcel",
  } as const;
</script>

<style>
  .item {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-regular);
  }
  .item:last-child {
    border-bottom: none;
  }
  .icon {
    color: var(--color-text-tertiary);
    padding-top: 0.125rem;
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .what {
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
  .time {
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
    white-space: nowrap;
  }
</style>

<div class="card">
  {#each items as a (a.kind + a.id)}
    <div class="item">
      <span class="icon"><Icon name={icons[a.kind]} /></span>
      <div class="body">
        {#if a.href}
          <a class="link ellipsis" style="display: block;" href={a.href}>{a.title}</a>
        {:else}
          <span class="ellipsis" style="display: block;">{a.title}</span>
        {/if}
        <div class="what">
          {a.detail ?? "committed"} in
          <a class="link" href={node.repoPath(a.repo)}>{node.ownerHandle(a.repo.owner)}/{a.repo.name}</a>
        </div>
      </div>
      <span class="time">{timeAgo(a.time)}</span>
    </div>
  {:else}
    <div class="item muted">No activity yet.</div>
  {/each}
</div>
