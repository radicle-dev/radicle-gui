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

  import CobTeaser from "@app/components/CobTeaser.svelte";
  import CountBadge from "@app/components/CountBadge.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/components/InlineTitle.svelte";
  import Label from "@app/components/Label.svelte";
  import NodeId from "@app/components/NodeId.svelte";

  interface Props {
    contextActive?: boolean;
    focussed?: boolean;
    oncontextmenu?: (event: MouseEvent) => void;
    issue: Issue;
    rid: string;
    status: IssueStatus;
  }

  const { contextActive, focussed, oncontextmenu, issue, rid, status }: Props =
    $props();
</script>

<CobTeaser
  {contextActive}
  {focussed}
  {oncontextmenu}
  chipColor={issueStatusColor[issue.state.status]}
  chipBackground={issueStatusBackgroundColor[issue.state.status]}
  onclick={() => {
    void push({ resource: "repo.issue", rid, issue: issue.id, status });
  }}>
  {#snippet icon()}
    {#if issue.state.status === "open"}
      <Icon name="issue" />
    {:else}
      <Icon name="issue-closed" />
    {/if}
  {/snippet}
  {#snippet heading()}
    <InlineTitle content={issue.title} />
  {/snippet}
  {#snippet meta()}
    <NodeId {...authorForNodeId(issue.author)} />
    opened
    <Id id={issue.id} clipboard={issue.id} label="issue ID" />
    <span title={absoluteTimestamp(issue.timestamp)}>
      {formatTimestamp(issue.timestamp)}
    </span>
  {/snippet}
  {#snippet badges()}
    {#each issue.labels as label}
      <Label {label} />
    {/each}
    {#if issue.commentCount > 0}
      <CountBadge icon="comment" count={issue.commentCount} title="Comments" />
    {/if}
  {/snippet}
</CobTeaser>
