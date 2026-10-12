<script lang="ts">
  import type { IssueStatus } from "@app/views/repo/router";
  import type { Issue } from "@bindings/cob/issue/Issue";

  import { push } from "@app/lib/router";
  import {
    absoluteTimestamp,
    authorForNodeId,
    formatTimestamp,
    issueStatusBackgroundColor,
    issueStatusColor,
  } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/components/InlineTitle.svelte";
  import Label from "@app/components/Label.svelte";
  import NodeId from "@app/components/NodeId.svelte";

  interface Props {
    focussed?: boolean;
    issue: Issue;
    rid: string;
    status: IssueStatus;
  }

  const { focussed, issue, rid, status }: Props = $props();
</script>

<style>
  .issue-teaser {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-height: 5rem;
    background-color: var(--color-surface-canvas);
    padding: 1rem;
    cursor: pointer;
    font: var(--txt-body-l-regular);
    word-break: break-word;
    width: 100%;
  }
  .issue-teaser:hover {
    background-color: var(--color-surface-subtle);
  }
  .status {
    padding: 0;
    margin-right: 1rem;
  }
  .issue-teaser:first-of-type {
    border-radius: var(--border-radius-sm) var(--border-radius-sm) 0 0;
  }
  .issue-teaser:last-of-type {
    border-radius: 0 0 var(--border-radius-sm) var(--border-radius-sm);
  }
  .issue-teaser:only-of-type {
    border-radius: var(--border-radius-sm);
  }
</style>

{#snippet issueSnippet()}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    tabindex="0"
    role="button"
    class="issue-teaser"
    style:align-items="flex-start"
    style:clip-path={focussed ? "none" : undefined}
    style:padding={focussed ? "1rem" : "20px"}
    onclick={() => {
      void push({ resource: "repo.issue", rid, issue: issue.id, status });
    }}>
    <div class="global-flex" style:align-items="flex-start">
      <div
        class="global-chip status"
        style:color={issueStatusColor[issue.state.status]}
        style:background-color={issueStatusBackgroundColor[issue.state.status]}>
        {#if issue.state.status === "open"}
          <Icon name="issue" />
        {:else}
          <Icon name="issue-closed" />
        {/if}
      </div>
      <div
        class="global-flex"
        style:flex-direction="column"
        style:align-items="flex-start">
        <InlineTitle content={issue.title} />
        <div class="global-flex txt-body-m-regular" style:flex-wrap="wrap">
          <NodeId {...authorForNodeId(issue.author)} />
          opened
          <Id id={issue.id} clipboard={issue.id} label="issue ID" />
          <span title={absoluteTimestamp(issue.timestamp)}>
            {formatTimestamp(issue.timestamp)}
          </span>
        </div>
      </div>
    </div>

    <div class="global-flex" style:margin-left="auto">
      {#each issue.labels as label}
        <Label {label} />
      {/each}

      {#if issue.commentCount > 0}
        <div
          class="txt-body-m-regular global-flex"
          style:gap="0.25rem"
          style:border="1px solid var(--color-border-subtle)"
          style:border-radius="var(--border-radius-sm)"
          style:height="1.5rem"
          style:padding="0 0.5rem"
          style:color="var(--color-text-tertiary)">
          <Icon name="comment" />
          {issue.commentCount}
        </div>
      {/if}
    </div>
  </div>
{/snippet}

{#if focussed}
  <div
    style:border="1px solid var(--color-border-brand)"
    style:border-radius="var(--border-radius-sm)"
    style:display="flex"
    style:gap="0.5rem"
    style:align-items="center"
    style:background-color="var(--color-surface-canvas)">
    {@render issueSnippet()}
  </div>
{:else}
  {@render issueSnippet()}
{/if}
