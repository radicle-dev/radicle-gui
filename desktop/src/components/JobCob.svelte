<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import type { RunView, Status } from "@app/lib/ciJobs";
  import {
    aggregateStatus,
    groupJobs,
    statusLabel,
    totalCounts,
  } from "@app/lib/ciJobs";
  import { cachedListJobs } from "@app/lib/invoke";
  import { authorForNodeId } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";

  import NodeId from "./NodeId.svelte";

  interface Props {
    commit: string;
    rid: string;
    styleHeight?: "1.75rem" | "2rem" | "2.5rem";
  }

  const { commit, rid, styleHeight = "2rem" }: Props = $props();

  const collapsed = new SvelteSet<string>();
  let popoverExpanded: boolean = $state(false);

  // Held in a `$derived`; see `ReviewCodeThread`. The TTL here means a re-run
  // would refetch and blank the chip.
  const jobsPromise = $derived(cachedListJobs(rid, commit).catch(() => []));

  function toggleNode(key: string) {
    if (collapsed.has(key)) {
      collapsed.delete(key);
    } else {
      collapsed.add(key);
    }
  }
</script>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
  }
  .chip.succeeded {
    color: var(--color-feedback-success-text);
    background-color: var(--color-feedback-success-bg);
  }
  .chip.failed {
    color: var(--color-feedback-error-text);
    background-color: var(--color-feedback-error-bg);
  }
  .chip.started {
    color: var(--color-text-quaternary);
    background-color: var(--color-surface-mid);
  }
  .popover-body {
    display: flex;
    flex-direction: column;
    min-width: 24rem;
    font: var(--txt-body-m-regular);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
    padding: 0 0.75rem;
    border-radius: var(--border-radius-sm);
  }
  .node-header {
    cursor: pointer;
    user-select: none;
  }
  .node-header:hover,
  a.run-row:hover {
    background-color: var(--color-surface-subtle);
  }
  .chevron {
    width: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-quaternary);
  }
  .node-name {
    min-width: 0;
    flex: 1;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    overflow: hidden;
  }
  .inline-host {
    color: var(--color-text-secondary);
    font: var(--txt-body-s-regular);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    color: var(--color-text-secondary);
    font: var(--txt-body-s-regular);
    white-space: nowrap;
  }
  .host-row {
    padding-left: 2.25rem;
    color: var(--color-text-secondary);
    font: var(--txt-body-s-regular);
  }
  /*
   * 3.75rem = row padding (0.75) + chevron (1) + gap (0.5) + header chip (1)
   * + gap (0.5), so the run status chip sits under the node avatar.
   */
  .run-row {
    padding-left: 3.75rem;
    text-decoration: none;
    color: var(--color-text-primary);
  }
  a.run-row {
    cursor: pointer;
  }
  .run-label {
    flex: 1;
    white-space: nowrap;
  }
  .run-id {
    font: var(--txt-code-regular);
  }
  .run-affordance {
    color: var(--color-text-quaternary);
    white-space: nowrap;
  }
  .run-affordance.muted {
    font: var(--txt-body-s-regular);
  }
</style>

{#await jobsPromise then jobs}
  {#if jobs.length > 0}
    {@const groups = groupJobs(jobs)}
    {@const overallCounts = totalCounts(groups)}
    {@const overall = aggregateStatus(overallCounts)}
    {#snippet statusChip(status: Status)}
      <span class="chip {status}">
        {#if status === "succeeded"}
          <Icon name="checkmark" />
        {:else if status === "failed"}
          <Icon name="close" />
        {:else}
          <Icon name="hourglass" />
        {/if}
      </span>
    {/snippet}
    {#snippet runRow(view: RunView)}
      {#if view.safeLog}
        <a
          class="row run-row"
          href={view.safeLog}
          target="_blank"
          rel="noopener noreferrer">
          {@render statusChip(view.run.status)}
          <span class="run-label">
            run <span class="run-id">{view.label}</span>
          </span>
          <span class="run-affordance">
            <Icon name="open-external" />
          </span>
        </a>
      {:else}
        <div class="row run-row">
          {@render statusChip(view.run.status)}
          <span class="run-label">
            run <span class="run-id">{view.label}</span>
          </span>
          <span class="run-affordance muted">(no log)</span>
        </div>
      {/if}
    {/snippet}
    <Popover placement="bottom-end" bind:expanded={popoverExpanded}>
      {#snippet toggle(onclick)}
        <Button
          variant="naked"
          {styleHeight}
          onclick={e => {
            e.stopPropagation();
            onclick();
          }}
          active={popoverExpanded}>
          {@render statusChip(overall)}
          {statusLabel(overallCounts)}
          <Icon name="chevron-down" />
        </Button>
      {/snippet}

      {#snippet popover()}
        <div
          style:border="1px solid var(--color-border-subtle)"
          style:border-radius="var(--border-radius-sm)"
          style:background-color="var(--color-surface-canvas)"
          style:padding="0.25rem">
          <div class="popover-body">
            {#each groups as group (group.nodeKey)}
              {@const isCollapsed = collapsed.has(group.nodeKey)}
              <div class="node-group">
                <div
                  class="row node-header"
                  role="button"
                  tabindex="0"
                  onclick={() => toggleNode(group.nodeKey)}
                  onkeydown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleNode(group.nodeKey);
                    }
                  }}>
                  <span class="chevron">
                    <Icon
                      name={isCollapsed ? "chevron-right" : "chevron-down"} />
                  </span>
                  {@render statusChip(group.status)}
                  <span class="node-name">
                    <NodeId {...authorForNodeId(group.author)} />
                    {#if group.inlineHost}
                      <span class="inline-host">· {group.inlineHost}</span>
                    {/if}
                  </span>
                  <span class="count">
                    {statusLabel(group.counts)}
                  </span>
                </div>

                {#if !isCollapsed}
                  {#if group.flatRuns}
                    {#each group.flatRuns as view (view.run.runId)}
                      {@render runRow(view)}
                    {/each}
                  {:else}
                    {#each group.hosts as host}
                      <div class="row host-row">
                        <span>{host.host}</span>
                      </div>
                      {#each host.runs as view (view.run.runId)}
                        {@render runRow(view)}
                      {/each}
                    {/each}
                  {/if}
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/snippet}
    </Popover>
  {/if}
{/await}
