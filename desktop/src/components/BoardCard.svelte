<script lang="ts">
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { Patch } from "@bindings/cob/patch/Patch";

  import type { BoardItem } from "@app/lib/board";
  import {
    displayLabels,
    itemAssignees,
    itemComments,
    itemLabels,
    itemTimestamp,
    itemTitle,
    PRIORITIES,
    priorityOf,
  } from "@app/lib/board";
  import type { Property } from "@app/lib/boardView";
  import { absoluteTimestamp, formatTimestamp } from "@app/lib/utils";

  import AvatarStack from "@app/components/AvatarStack.svelte";
  import Icon from "@app/components/Icon.svelte";
  import PriorityIcon from "@app/components/PriorityIcon.svelte";

  interface Props {
    item: BoardItem;
    layout: "card" | "row";
    properties: Property[];
    locked: boolean;
    rid: string;
    repoName: (rid: string) => string;
    seeding: boolean;
    column?: string;
    onOpenPatch: (patch: Patch) => void;
  }

  const {
    item,
    layout,
    properties,
    locked,
    rid,
    repoName,
    seeding,
    column,
    onOpenPatch,
  }: Props = $props();

  const foreign = $derived(item.card.rid !== rid);
  const priority = $derived(priorityOf(itemLabels(item)));
  const timestamp = $derived(itemTimestamp(item));

  function shows(property: Property): boolean {
    return properties.includes(property);
  }

  function shortId(id: string) {
    return id.slice(0, 7);
  }

  const patchIcon: Record<
    Patch["state"]["status"],
    "patch" | "patch-draft" | "patch-archived" | "patch-merged"
  > = {
    draft: "patch-draft",
    open: "patch",
    archived: "patch-archived",
    merged: "patch-merged",
  };

  function issueState(issue: Issue): string {
    if (issue.state.status === "open") return "Open";
    return issue.state.reason === "solved"
      ? "Closed as solved"
      : "Closed as other";
  }

  function patchState(patch: Patch): string {
    return {
      draft: "Draft",
      open: "Open",
      archived: "Archived",
      merged: "Merged",
    }[patch.state.status];
  }
</script>

<style>
  .card-top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .card-title {
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    word-break: break-word;
  }
  .card-title.locked,
  .card-top.locked > span:not(.lock) {
    color: var(--color-text-secondary);
  }
  .card-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    height: 1.25rem;
    padding: 0 0.375rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .patch-chip {
    gap: 0.25rem;
    background: none;
    cursor: pointer;
    font-family: var(--font-family-monospace, monospace);
  }
  .patch-chip:hover {
    border-color: var(--color-border-mid);
    color: var(--color-text-primary);
  }
  .closed {
    gap: 0.25rem;
    color: var(--color-text-secondary);
  }
  .unresolved {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .assignees {
    display: flex;
    margin-left: auto;
  }
  .lock {
    display: flex;
    flex-shrink: 0;
    color: var(--color-text-quaternary);
  }
  .card-top .lock {
    margin-left: auto;
  }
  .card-top .assignees + .lock {
    margin-left: 0;
  }
  .row-id {
    color: var(--color-text-tertiary);
    width: 4.5rem;
    flex-shrink: 0;
    font-family: var(--font-family-monospace, monospace);
  }
  .row-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }
  .row-main > *:not(.row-title) {
    flex-shrink: 0;
  }
  .row-title {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-primary);
  }
  .row-comments {
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
    width: 3.5rem;
  }
  .row-date {
    color: var(--color-text-tertiary);
    white-space: nowrap;
    width: 2.5rem;
    flex-shrink: 0;
    text-align: right;
  }
</style>

{#snippet assignees()}
  {@const people = itemAssignees(item)}
  {#if people.length > 0}
    <div class="assignees">
      <AvatarStack {people} />
    </div>
  {/if}
{/snippet}

{#snippet labels()}
  {#each displayLabels(itemLabels(item)) as label}
    <span class="chip" title={label}>{label}</span>
  {/each}
{/snippet}

{#snippet patchChips()}
  {#if item.kind === "issue"}
    {#each item.patches as patch (patch.id)}
      <button
        class="chip patch-chip"
        title={`${patch.title} (${patchState(patch)})`}
        onpointerdown={e => e.stopPropagation()}
        onclick={e => {
          e.stopPropagation();
          onOpenPatch(patch);
        }}>
        <Icon name={patchIcon[patch.state.status]} />
        {shortId(patch.id)}
      </button>
    {/each}
  {/if}
{/snippet}

{#snippet repoChip()}
  {#if foreign}
    <span class="chip" style:gap="0.25rem" title={item.card.rid}>
      <Icon name="repository" />{repoName(item.card.rid)}
    </span>
  {/if}
  {#if item.kind === "unresolved"}
    <span class="unresolved" title={item.card.rid}>
      {seeding ? "Seeding…" : "Click to seed this repository"}
    </span>
  {/if}
{/snippet}

{#snippet closedNote()}
  {#if item.kind === "issue" && item.showsClosed}
    <span
      class="chip closed"
      title="This board has no column for closed issues">
      <Icon name="issue-closed" />Closed
    </span>
  {/if}
{/snippet}

{#snippet commentCount()}
  {@const comments = itemComments(item)}
  {#if comments > 0 && shows("comments")}
    <span class="chip" style:gap="0.25rem">
      <Icon name="comment" />{comments}
    </span>
  {/if}
{/snippet}

{#snippet typeIcon()}
  {#if item.kind === "issue"}
    <span title={issueState(item.issue)} style:display="flex">
      <Icon
        name={item.issue.state.status === "open" ? "issue" : "issue-closed"} />
    </span>
  {:else if item.kind === "patch"}
    <span title={patchState(item.patch)} style:display="flex">
      <Icon name={patchIcon[item.patch.state.status]} />
    </span>
  {/if}
{/snippet}

{#snippet lock()}
  {#if locked}
    <span class="lock"><Icon name="lock" /></span>
  {/if}
{/snippet}

{#if layout === "card"}
  <div class="card-top" class:locked>
    {@render typeIcon()}
    {#if shows("id")}
      <span>{shortId(item.card.oid)}</span>
    {/if}
    {#if shows("id") && shows("created")}
      <span>·</span>
    {/if}
    {#if shows("created")}
      <span title={absoluteTimestamp(timestamp)}>
        {formatTimestamp(timestamp)}
      </span>
    {/if}
    {#if shows("assignees")}{@render assignees()}{/if}
    {@render lock()}
  </div>
  <div class="card-title" class:locked>{itemTitle(item)}</div>
  <div class="card-meta">
    {#if item.kind !== "unresolved" && shows("priority")}
      <span
        title={PRIORITIES.find(p => p.id === priority)?.label}
        style:display="flex">
        <PriorityIcon {priority} />
      </span>
    {/if}
    {#if shows("repository")}{@render repoChip()}{/if}
    {#if shows("patches")}{@render patchChips()}{/if}
    {#if shows("labels")}{@render labels()}{/if}
    {@render commentCount()}
    {@render closedNote()}
  </div>
{:else}
  {#if item.kind !== "unresolved" && shows("priority")}
    <PriorityIcon {priority} />
  {/if}
  {#if shows("id")}
    <span class="row-id">{shortId(item.card.oid)}</span>
  {/if}
  {@render typeIcon()}
  <div class="row-main">
    <span class="row-title">{itemTitle(item)}</span>
    {#if shows("patches")}{@render patchChips()}{/if}
    {#if shows("repository")}{@render repoChip()}{/if}
  </div>
  {@render lock()}
  {@render closedNote()}
  <div class="card-meta">
    {#if column !== undefined}
      <span class="chip">{column}</span>
    {/if}
    {#if shows("labels")}{@render labels()}{/if}
  </div>
  {#if shows("comments")}
    <div class="row-comments">{@render commentCount()}</div>
  {/if}
  {#if shows("assignees")}
    <div style:width="4rem" style:display="flex">
      {@render assignees()}
    </div>
  {/if}
  {#if shows("created")}
    <span class="row-date" title={absoluteTimestamp(timestamp)}>
      {formatTimestamp(timestamp)}
    </span>
  {/if}
{/if}
