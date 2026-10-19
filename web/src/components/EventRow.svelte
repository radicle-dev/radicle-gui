<script lang="ts">
  import type { CobEvent } from "@app/node/model";

  import { node } from "@app/node/node.svelte";

  import LabelChip from "./LabelChip.svelte";
  import TimelineRow from "./TimelineRow.svelte";

  interface Props {
    event: CobEvent;
    kind: "issue" | "patch";
  }

  const { event, kind }: Props = $props();

  const stateLook = $derived.by(() => {
    if (event.kind !== "state") return undefined;
    switch (event.state) {
      case "open":
        return { icon: kind === "issue" ? ("issue" as const) : ("patch" as const), tone: "open", text: `reopened ${kind}` };
      case "solved":
        return { icon: "issue-closed" as const, tone: "closed", text: "closed issue as solved" };
      case "closed":
        return { icon: "issue-closed" as const, tone: "closed", text: "closed issue" };
      case "draft":
        return { icon: "patch-draft" as const, tone: "draft", text: "converted patch to draft" };
      case "archived":
        return { icon: "patch-archived" as const, tone: "archived", text: "archived patch" };
      default:
        return { icon: "patch-merged" as const, tone: "merged", text: "merged patch" };
    }
  });
</script>

{#if event.kind === "labels"}
  <TimelineRow icon="label" author={event.author} time={event.time}>
    {#if event.added.length}
      <span>added {event.added.length === 1 ? "label" : "labels"}</span>
      {#each event.added as l (l)}<LabelChip label={l} />{/each}
    {/if}
    {#if event.removed.length}
      <span>removed {event.removed.length === 1 ? "label" : "labels"}</span>
      {#each event.removed as l (l)}<LabelChip label={l} />{/each}
    {/if}
  </TimelineRow>
{:else if event.kind === "assign"}
  <TimelineRow icon="avatar-incognito" author={event.author} time={event.time}>
    {#if event.added.length}
      <span>assigned</span>
      {#each event.added as p (p)}<b>{node.person(p).alias}</b>{/each}
    {/if}
    {#if event.removed.length}
      <span>unassigned</span>
      {#each event.removed as p (p)}<b>{node.person(p).alias}</b>{/each}
    {/if}
  </TimelineRow>
{:else if event.kind === "title"}
  <TimelineRow icon="edit" author={event.author} time={event.time}>
    <span>changed the title to</span><b>{event.title}</b>
  </TimelineRow>
{:else if stateLook}
  <TimelineRow
    icon={stateLook.icon}
    iconColor={`var(--color-text-${stateLook.tone})`}
    author={event.author}
    time={event.time}>
    <span>{stateLook.text}</span>
  </TimelineRow>
{/if}
