<script lang="ts">
  import type { BaseUrl, Issue } from "@http-client";

  import { absoluteTimestamp, formatTimestamp } from "@app/lib/utils";

  import CommentCounter from "../CommentCounter.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineLabels from "../Cob/InlineLabels.svelte";
  import InlineTitle from "@app/views/repos/components/InlineTitle.svelte";
  import Link from "@app/components/Link.svelte";
  import NodeId from "@app/components/NodeId.svelte";

  export let baseUrl: BaseUrl;
  export let issue: Issue;
  export let repoId: string;

  $: commentCount = issue.discussion.reduce((acc, _curr, index) => {
    if (index !== 0) {
      return acc + 1;
    }
    return acc;
  }, 0);
</script>

<style>
  .issue-teaser {
    display: flex;
    padding: 1.25rem;
    background-color: var(--color-surface-canvas);
  }
  .issue-teaser:hover {
    background-color: var(--color-surface-subtle);
  }
  .content {
    gap: 0.5rem;
    display: flex;
    flex-direction: column;
    flex: 1;
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
    display: flex;
    margin-left: auto;
    min-height: 1.5rem;
    align-items: center;
  }
  .state {
    justify-self: center;
    align-self: flex-start;
    margin-right: 0.5rem;
    padding: 0.25rem 0.25rem;
  }
  .open {
    color: var(--color-text-open);
    background: var(--color-surface-open);
    border-radius: var(--border-radius-xs);
  }
  .closed {
    color: var(--color-text-merged);
    background: var(--color-surface-merged);
    border-radius: var(--border-radius-xs);
  }
</style>

<div role="button" tabindex="0" class="issue-teaser">
  <div
    class="state"
    class:closed={issue.state.status === "closed"}
    class:open={issue.state.status === "open"}>
    <Icon name={issue.state.status === "closed" ? "issue-closed" : "issue"} />
  </div>
  <div class="content">
    <div class="summary">
      <span class="issue-title">
        <Link
          styleHoverState
          route={{
            resource: "repo.issue",
            repo: repoId,
            node: baseUrl,
            issue: issue.id,
          }}>
          {#if !issue.title}
            <span style:color="var(--color-text-tertiary)">No title</span>
          {:else}
            <InlineTitle fontSize="body-m-regular" content={issue.title} />
          {/if}
        </Link>
      </span>
      {#if issue.labels.length > 0}
        <span
          class="global-hide-on-small-desktop-down"
          style="display: inline-flex; gap: 0.5rem;">
          <InlineLabels labels={issue.labels} />
        </span>
      {/if}
      <div class="right">
        {#if commentCount > 0}
          <CommentCounter {commentCount} />
        {/if}
      </div>
    </div>
    <div class="subtitle">
      {#if issue.labels.length > 0}
        <div
          class="global-hide-on-medium-desktop-up"
          style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <InlineLabels labels={issue.labels} />
        </div>
      {/if}
      <div
        style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <NodeId {baseUrl} nodeId={issue.author.id} alias={issue.author.alias} />
        opened
        <Id id={issue.id} />
        <span title={absoluteTimestamp(issue.discussion[0].timestamp)}>
          {formatTimestamp(issue.discussion[0].timestamp)}
        </span>
      </div>
    </div>
  </div>
</div>
