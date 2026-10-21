<script lang="ts">
  import type { BaseUrl } from "@http-client";
  import type { Patch } from "@http-client";

  import { absoluteTimestamp, formatTimestamp } from "@app/lib/utils";

  import CommentCounter from "../CommentCounter.svelte";
  import DiffStatBadgeLoader from "../DiffStatBadgeLoader.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineLabels from "@app/views/repos/Cob/InlineLabels.svelte";
  import InlineTitle from "@app/views/repos/components/InlineTitle.svelte";
  import Link from "@app/components/Link.svelte";
  import NodeId from "@app/components/NodeId.svelte";

  export let repoId: string;
  export let baseUrl: BaseUrl;
  export let patch: Patch;

  $: latestRevisionIndex = patch.revisions.length - 1;
  $: latestRevision = patch.revisions[latestRevisionIndex];

  $: commentCount = patch.revisions.reduce(
    (acc, curr) => acc + curr.discussions.reduce(acc => acc + 1, 0),
    0,
  );
</script>

<style>
  .patch-teaser {
    display: flex;
    padding: 1.25rem;
    background-color: var(--color-surface-canvas);
  }
  .patch-teaser:hover {
    background-color: var(--color-surface-subtle);
  }
  .content {
    width: 100%;
    gap: 0.5rem;
    display: flex;
    flex-direction: column;
  }
  .subtitle {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    font: var(--txt-body-m-regular);
    gap: 0.5rem;
  }
  .summary {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    word-break: break-word;
  }
  .right {
    margin-left: auto;
    display: flex;
    align-items: flex-start;
  }
  .state {
    justify-self: center;
    align-self: flex-start;
    margin-right: 0.5rem;
    padding: 0.25rem 0.25rem;
    border-radius: var(--border-radius-xs);
  }
  .open {
    color: var(--color-text-open);
    background: var(--color-surface-open);
  }
  .archived {
    color: var(--color-text-archived);
    background: var(--color-surface-archived);
  }
  .merged {
    color: var(--color-text-merged);
    background: var(--color-surface-merged);
  }
  .draft {
    color: var(--color-text-draft);
    background: var(--color-surface-draft);
  }
  .diff-comment {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
    min-height: 1.5rem;
  }
</style>

<div role="button" tabindex="0" class="patch-teaser">
  <div
    class="state"
    class:draft={patch.state.status === "draft"}
    class:open={patch.state.status === "open"}
    class:merged={patch.state.status === "merged"}
    class:archived={patch.state.status === "archived"}>
    <Icon
      name={patch.state.status === "draft"
        ? "patch-draft"
        : patch.state.status === "merged"
          ? "patch-merged"
          : patch.state.status === "archived"
            ? "patch-archived"
            : "patch"} />
  </div>
  <div class="content">
    <div class="summary">
      <Link
        styleHoverState
        route={{
          resource: "repo.patch",
          repo: repoId,
          node: baseUrl,
          patch: patch.id,
        }}>
        <InlineTitle fontSize="body-m-regular" content={patch.title} />
      </Link>
      {#if patch.labels.length > 0}
        <span
          class="global-hide-on-small-desktop-down"
          style="display: inline-flex; gap: 0.5rem;">
          <InlineLabels labels={patch.labels} />
        </span>
      {/if}
      <div class="right">
        <div class="diff-comment">
          {#if commentCount > 0}
            <CommentCounter {commentCount} />
          {/if}
          <DiffStatBadgeLoader {repoId} {baseUrl} {patch} {latestRevision} />
        </div>
      </div>
    </div>
    <div class="summary">
      <span class="subtitle">
        {#if patch.labels.length > 0}
          <div
            class="global-hide-on-medium-desktop-up"
            style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <InlineLabels labels={patch.labels} />
          </div>
        {/if}
        <div
          style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <NodeId
            {baseUrl}
            nodeId={patch.author.id}
            alias={patch.author.alias} />
          {patch.revisions.length > 1 ? "updated" : "opened"}
          <Id id={patch.id} />
          {#if patch.revisions.length > 1}
            <span class="global-hide-on-mobile-down">
              to <Id id={patch.revisions[patch.revisions.length - 1].id} />
            </span>
          {/if}
          <span title={absoluteTimestamp(latestRevision.timestamp)}>
            {formatTimestamp(latestRevision.timestamp)}
          </span>
        </div>
      </span>
    </div>
  </div>
</div>
