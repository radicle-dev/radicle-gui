<script lang="ts">
  import type { RepoRoute } from "@app/views/repos/router";
  import type { PeerRefs } from "@http-client";

  import { closeFocused } from "@app/components/Popover.svelte";
  import {
    formatCommit,
    getBranchesFromRefs,
    getTagsFromRefs,
  } from "@app/lib/utils";
  import { replace } from "@app/lib/router";

  import Badge from "@app/components/Badge.svelte";
  import DropdownListItem from "@app/components/DropdownList/DropdownListItem.svelte";
  import IconButton from "@app/components/IconButton.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Link from "@app/components/Link.svelte";
  import NodeId from "@app/components/NodeId.svelte";

  export let baseRoute: Extract<
    RepoRoute,
    { resource: "repo.source" } | { resource: "repo.history" }
  >;
  export let peer: { remote: PeerRefs; selected: boolean };
  export let revision: string | undefined = undefined;
  export let type: "branches" | "tags" = "branches";
  export let selectedTagName: string | undefined = undefined;

  const subgridStyle =
    "display: grid; grid-template-columns: subgrid; grid-column: span 2;";
  let expanded = false;

  $: refs =
    type === "branches"
      ? getBranchesFromRefs(peer.remote.refs)
      : getTagsFromRefs(peer.remote.refs);

  $: if (peer.selected) {
    expanded = true;
  }
</script>

<style>
  .subgrid-item {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: span 2;
  }
</style>

<div class="subgrid-item" aria-label="peer-item">
  <div class="global-flex-item" style="padding: 0.5rem 0">
    <IconButton title="Expand peer" on:click={() => (expanded = !expanded)}>
      <Icon name={expanded ? "chevron-down" : "chevron-right"} />
    </IconButton>
    <NodeId
      baseUrl={baseRoute.node}
      nodeId={peer.remote.id}
      alias={peer.remote.alias} />
    {#if peer.remote.delegate}
      <Badge size="tiny" variant="delegate">
        <Icon name="badge" />
        <span class="global-hide-on-small-desktop-down">Delegate</span>
      </Badge>
    {/if}
  </div>
</div>
{#if expanded}
  {#each Object.entries(refs) as [name, head]}
    <Link
      style={subgridStyle}
      route={{
        ...baseRoute,
        peer: peer.remote.id,
        revision: type === "tags" ? encodeURIComponent(name) : name,
      }}
      on:afterNavigate={() => closeFocused()}>
      <DropdownListItem
        selected={type === "tags"
          ? peer.selected &&
            (selectedTagName === name || revision === encodeURIComponent(name))
          : peer.selected && revision === name}
        on:click={() =>
          replace({
            ...baseRoute,
            peer: peer.remote.id,
            revision: type === "tags" ? encodeURIComponent(name) : name,
          })}
        style={`${subgridStyle} padding-left: 2.3rem;`}>
        <div class="global-flex-item">
          <Icon name={type === "branches" ? "branch" : "label"} />
          <span class="txt-overflow">
            {name}
          </span>
        </div>
        <div class="global-flex-item">
          <span class="txt-id" style="color: var(--color-text-tertiary);">
            {formatCommit(head)}
          </span>
        </div>
      </DropdownListItem>
    </Link>
  {/each}
{/if}
