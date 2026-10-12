<script lang="ts" module>
  import type { Author } from "@bindings/cob/Author";

  import type { FlattenedIssueOperation } from "@app/lib/issueTimeline";

  export type { FlattenedIssueOperation };
</script>

<script lang="ts">
  import { itemDiff } from "@app/lib/cobActivity";
  import {
    absoluteTimestamp,
    authorForNodeId,
    formatTimestamp,
    issueStatusColor,
    issueStatusIcon,
    pluralize,
  } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import Label from "@app/components/Label.svelte";
  import NodeId from "@app/components/NodeId.svelte";

  interface Props {
    op: FlattenedIssueOperation;
    // Set when the surrounding run already names the author above the group.
    hideAuthor?: boolean;
  }

  const { op, hideAuthor }: Props = $props();
</script>

<style>
  .timeline-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.375rem 0.5rem;
    min-height: 2.5rem;
  }
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1rem;
  }
  .wrapper {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    flex: 1 1 0;
  }
  .summary {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-primary);
  }
  /* Ellipsis has to sit on a child: it does not apply to the anonymous flex
     items a flex container makes of its text nodes. */
  .summary-text {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .timestamp {
    flex-shrink: 0;
    color: var(--color-text-quaternary);
  }
</style>

{#snippet timestamp()}
  <span class="timestamp" title={absoluteTimestamp(op.timestamp)}>
    {formatTimestamp(op.timestamp)}
  </span>
{/snippet}

{#if op.type === "opened"}
  <div class="timeline-item txt-body-m-regular">
    <div class="icon" style:color={issueStatusColor.open}>
      <Icon name={issueStatusIcon.open} />
    </div>
    <div class="wrapper">
      {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
      <span class="summary">
        <span class="summary-text">opened this issue</span>
      </span>
      {@render timestamp()}
    </div>
  </div>
{:else if op.type === "lifecycle"}
  <div class="timeline-item txt-body-m-regular">
    <div class="icon" style:color={issueStatusColor[op.state.status]}>
      <Icon name={issueStatusIcon[op.state.status]} />
    </div>
    <div class="wrapper">
      {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
      <span class="summary">
        <span class="summary-text">
          {#if op.state.status === "closed"}
            closed this issue as {op.state.reason}
          {:else}
            reopened this issue
          {/if}
        </span>
      </span>
      {@render timestamp()}
    </div>
  </div>
{:else if op.type === "label"}
  <div class="timeline-item txt-body-m-regular">
    <div class="icon"><Icon name="label" /></div>
    <div class="wrapper">
      {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
      <span class="summary">
        {#if op.previous && op.previous.type === op.type}
          {@const changed = itemDiff(op.previous?.labels ?? [], op.labels)}
          {#if changed.added.length}
            <span class="summary-text">
              added {pluralize("label", changed.added.length)}
            </span>
            {#each changed.added as label}<Label {label} />{/each}
          {/if}
          {#if changed.removed.length}
            <span class="summary-text">
              removed {pluralize("label", changed.removed.length)}
            </span>
            {#each changed.removed as label}<Label {label} />{/each}
          {/if}
        {:else}
          <span class="summary-text">
            added {pluralize("label", op.labels.length)}
          </span>
          {#each op.labels as label}<Label {label} />{/each}
        {/if}
      </span>
      {@render timestamp()}
    </div>
  </div>
{:else if op.type === "assign"}
  <div class="timeline-item txt-body-m-regular">
    <div class="icon"><Icon name="avatar-incognito" /></div>
    <div class="wrapper">
      {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
      <span class="summary">
        {#if op.previous && op.previous.type === op.type}
          {@const changed = itemDiff<Author>(
            op.previous?.assignees ?? [],
            op.assignees,
            assignee => assignee.did,
          )}
          {#if changed.added.length}
            <span class="summary-text">assigned</span>
            {#each changed.added as assignee}
              <NodeId {...authorForNodeId(assignee)} />
            {/each}
          {/if}
          {#if changed.removed.length}
            <span class="summary-text">unassigned</span>
            {#each changed.removed as assignee}
              <NodeId {...authorForNodeId(assignee)} />
            {/each}
          {/if}
        {:else}
          <span class="summary-text">assigned</span>
          {#each op.assignees as assignee}
            <NodeId {...authorForNodeId(assignee)} />
          {/each}
        {/if}
      </span>
      {@render timestamp()}
    </div>
  </div>
{:else if op.type === "edit"}
  {#if op.previous && op.previous.type === op.type}
    <div class="timeline-item txt-body-m-regular">
      <div class="icon"><Icon name="edit" /></div>
      <div class="wrapper">
        {#if !hideAuthor}<NodeId {...authorForNodeId(op.author)} />{/if}
        <span class="summary">
          <span
            class="summary-text"
            title={`changed the title from “${op.previous.title}” to “${op.title}”`}>
            changed the title from “{op.previous.title}” to “{op.title}”
          </span>
        </span>
        {@render timestamp()}
      </div>
    </div>
  {/if}
{/if}
