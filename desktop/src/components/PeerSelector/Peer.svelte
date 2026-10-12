<script lang="ts">
  import type { SourceBaseRoute } from "@app/views/repo/router";
  import type { Remote } from "@bindings/repo/Remote";
  import type { Tag } from "@bindings/repo/Tag";

  import { sortedTags } from "@app/lib/refs";
  import * as router from "@app/lib/router";
  import { formatOid, truncateId } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import TagIcon from "@app/components/PeerSelector/TagIcon.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  interface Props {
    baseRoute: SourceBaseRoute;
    remote: Remote;
    selected: boolean;
    revision?: string;
    tab: "branches" | "tags";
    onSelect: () => void;
  }

  const { baseRoute, remote, selected, revision, tab, onSelect }: Props =
    $props();

  // Initial expansion follows whether this peer is currently selected; the
  // user can collapse/expand it freely after that without being overridden.
  // svelte-ignore state_referenced_locally
  let expanded = $state(selected);

  const refEntries = $derived.by<{ name: string; oid: string; tag?: Tag }[]>(
    () => {
      if (tab === "branches") {
        return Object.entries(remote.branches)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, oid]) => ({ name, oid }));
      }
      return sortedTags(remote.tags).map(([name, tag]) => ({
        name,
        oid: tag.oid,
        tag,
      }));
    },
  );

  function routeFor(name: string): string {
    return router.routeToPath({
      ...baseRoute,
      peer: remote.id,
      revision: name,
    });
  }
</script>

<style>
  .peer-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .peer-header:hover {
    background-color: var(--color-surface-subtle);
  }
  .peer-header.selected {
    background-color: var(--color-surface-subtle);
  }
  .peer-identity {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    flex: 1;
  }
  .avatar {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .no-alias {
    color: var(--color-text-secondary);
  }
  .delegate-badge {
    color: var(--color-text-brand);
    display: inline-flex;
    align-items: center;
  }
  .ref-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    /* Align icon with peer name: 0.75rem (header padding) + 1rem (avatar
     * width) + 0.375rem (peer-identity gap). */
    padding: 0.375rem 0.75rem 0.375rem 2.125rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    color: var(--color-text-primary);
    font: var(--txt-body-m-regular);
    text-decoration: none;
  }
  .ref-row:hover {
    background-color: var(--color-surface-subtle);
  }
  .ref-row.selected {
    background-color: var(--color-surface-subtle);
  }
  .ref-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
  .empty {
    padding: 0.5rem 0.75rem;
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
</style>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  role="button"
  tabindex="0"
  class="peer-header"
  class:selected={selected && !expanded}
  onclick={() => (expanded = !expanded)}>
  <div class="peer-identity">
    <div class="avatar">
      <UserAvatar nodeId={remote.id} styleWidth="1rem" />
    </div>
    {#if remote.alias}
      <span class="name">{remote.alias}</span>
    {:else}
      <span class="name no-alias">{truncateId(remote.id)}</span>
    {/if}
    {#if remote.delegate}
      <span class="delegate-badge" title="Delegate">
        <Icon name="badge" />
      </span>
    {/if}
  </div>
  <Icon name={expanded ? "chevron-up" : "chevron-down"} />
</div>

{#if expanded}
  {#if refEntries.length > 0}
    {#each refEntries as { name, oid, tag } (name)}
      <a
        class="ref-row"
        class:selected={selected && revision === name}
        href={routeFor(name)}
        onclick={onSelect}>
        {#if tag}
          <TagIcon {tag} />
        {:else}
          <Icon name="branch" />
        {/if}
        <span class="ref-name">{name}</span>
        <span class="txt-id">{formatOid(oid)}</span>
      </a>
    {/each}
  {:else}
    <div class="empty">No {tab}</div>
  {/if}
{/if}
