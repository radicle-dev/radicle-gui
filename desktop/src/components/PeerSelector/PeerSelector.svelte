<script lang="ts">
  import type { SourceBaseRoute } from "@app/views/repo/router";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";
  import type { RepoRefs } from "@bindings/repo/RepoRefs";

  import fuzzysort from "fuzzysort";

  import { debounced } from "@app/lib/debounced.svelte";
  import { selectedRefType, sortedTags, sortRemotes } from "@app/lib/refs";
  import * as router from "@app/lib/router";
  import { formatOid, truncateId } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import PeerEntry from "@app/components/PeerSelector/Peer.svelte";
  import TagIcon from "@app/components/PeerSelector/TagIcon.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import TextInput from "@app/components/TextInput.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  interface Props {
    baseRoute: SourceBaseRoute;
    repo: RepoInfo;
    refs?: RepoRefs;
    peer?: string;
    revision?: string;
  }

  const {
    baseRoute,
    repo,
    refs,
    peer = undefined,
    revision = undefined,
  }: Props = $props();

  const project = $derived(repo.payloads["xyz.radicle.project"]!);
  const defaultBranch = $derived(project.data.defaultBranch);
  const canonicalBranchNames = $derived(
    Object.keys(refs?.canonical.branches ?? {}).sort(),
  );
  const canonicalTagsSorted = $derived(sortedTags(refs?.canonical.tags ?? {}));

  const selectedPeer = $derived(refs?.remotes.find(r => r.id === peer));
  // Until refs load, fall back to the bare NID from the route so the trigger
  // can render the selected peer immediately.
  const displayPeer = $derived(
    selectedPeer ??
      (peer !== undefined
        ? { id: peer, alias: undefined, delegate: false }
        : undefined),
  );
  const onCanonicalDefault = $derived(
    peer === undefined &&
      (revision === undefined || revision === defaultBranch),
  );

  const refType = $derived(
    selectedRefType(revision, selectedPeer, refs?.canonical, defaultBranch),
  );

  const peersWithBranches = $derived(
    sortRemotes(
      (refs?.remotes ?? []).filter(r => Object.keys(r.branches).length > 0),
    ),
  );
  const peersWithTags = $derived(
    sortRemotes(
      (refs?.remotes ?? []).filter(r => Object.keys(r.tags).length > 0),
    ),
  );

  const hasTags = $derived(
    canonicalTagsSorted.length > 0 || peersWithTags.length > 0,
  );

  // Initial tab follows the currently selected ref type; the user can switch
  // freely after that.
  // svelte-ignore state_referenced_locally
  let activeTab: "branches" | "tags" = $state(
    refType === "tag" ? "tags" : "branches",
  );

  $effect(() => {
    if (!hasTags && activeTab === "tags") {
      activeTab = "branches";
    }
  });

  const peersForActiveTab = $derived(
    activeTab === "branches" ? peersWithBranches : peersWithTags,
  );

  let searchInput = $state("");
  const debouncedSearch = debounced(() => searchInput, 100);

  type SearchPeer = { id: string; alias?: string; delegate: boolean };
  type SearchElement = {
    peer?: SearchPeer;
    revision: string;
    oid: string;
    type: "branch" | "tag";
  };

  const branchElements = $derived<SearchElement[]>([
    ...canonicalBranchNames.map(name => ({
      revision: name,
      oid: refs?.canonical.branches[name] ?? "",
      type: "branch" as const,
    })),
    ...peersWithBranches.flatMap(remote =>
      Object.entries(remote.branches).map(([name, oid]) => ({
        peer: { id: remote.id, alias: remote.alias, delegate: remote.delegate },
        revision: name,
        oid,
        type: "branch" as const,
      })),
    ),
  ]);

  const tagElements = $derived<SearchElement[]>([
    ...canonicalTagsSorted.map(([name, tag]) => ({
      revision: name,
      oid: tag.oid,
      type: "tag" as const,
    })),
    ...peersWithTags.flatMap(remote =>
      Object.entries(remote.tags).map(([name, tag]) => ({
        peer: { id: remote.id, alias: remote.alias, delegate: remote.delegate },
        revision: name,
        oid: tag.oid,
        type: "tag" as const,
      })),
    ),
  ]);

  const searchElements = $derived(
    activeTab === "branches" ? branchElements : tagElements,
  );

  const searchResults = $derived(
    fuzzysort.go(debouncedSearch.current, searchElements, {
      keys: ["peer.alias", "revision"],
      threshold: 0.5,
    }),
  );

  function isElementSelected(el: SearchElement): boolean {
    if (el.peer === undefined) {
      return peer === undefined && revision === el.revision;
    }
    return peer === el.peer.id && revision === el.revision;
  }

  function routeFor(el: SearchElement): string {
    return router.routeToPath({
      ...baseRoute,
      peer: el.peer?.id,
      revision: el.revision,
    });
  }

  function canonicalRouteFor(revision: string | undefined): string {
    return router.routeToPath({
      ...baseRoute,
      peer: undefined,
      revision,
    });
  }

  function displayLabel(): string {
    if (revision !== undefined) return revision;
    return defaultBranch;
  }
</script>

<style>
  .dropdown {
    width: 34rem;
    background-color: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0.25rem;
  }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem 0.25rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .canonical-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    color: var(--color-text-primary);
    font: var(--txt-body-m-regular);
    text-decoration: none;
  }
  .canonical-row:hover {
    background-color: var(--color-surface-subtle);
  }
  .canonical-row.selected {
    background-color: var(--color-surface-subtle);
  }
  .canonical-badge {
    padding: 0 0.375rem;
    font: var(--txt-body-s-regular);
    background-color: var(--color-surface-brand-primary);
    color: var(--color-text-on-brand);
    border-radius: var(--border-radius-sm);
    height: 1.25rem;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }
  .trigger-content .canonical-badge {
    margin-left: auto;
  }
  .trigger-content {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    max-width: 100%;
    min-width: 0;
  }
  .trigger-ref {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }
  .trigger-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 14rem;
  }
  .trigger-peer {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }
  .trigger-peer-avatar {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }
  .trigger-peer-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 8rem;
  }
  .trigger-peer-name.no-alias {
    color: var(--color-text-secondary);
  }
  .trigger-delegate {
    color: var(--color-text-brand);
    display: inline-flex;
    align-items: center;
  }
  .trigger-separator {
    color: var(--color-text-tertiary);
  }
  .header-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem;
    margin-bottom: 0.25rem;
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }
  .tab {
    background: transparent;
    border: none;
    padding: 0.375rem 0.75rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    cursor: pointer;
    border-radius: var(--border-radius-sm);
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }
  .tab.active {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .tab:hover:not(.active) {
    background-color: var(--color-surface-subtle);
  }
  .search {
    flex: 1;
    min-width: 0;
  }
  .result-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    color: var(--color-text-primary);
    font: var(--txt-body-m-regular);
    text-decoration: none;
    min-width: 0;
  }
  .result-row:hover {
    background-color: var(--color-surface-subtle);
  }
  .result-row.selected {
    background-color: var(--color-surface-subtle);
  }
  .result-peer {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }
  .result-peer-avatar {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }
  .result-peer-name {
    color: var(--color-text-secondary);
  }
  .result-peer-name.no-alias {
    color: var(--color-text-tertiary);
  }
  .result-delegate {
    color: var(--color-text-brand);
    display: inline-flex;
    align-items: center;
  }
  .result-separator {
    color: var(--color-text-tertiary);
  }
  .result-name {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    overflow: hidden;
    min-width: 0;
    flex: 1;
  }
  .result-name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    padding: 0.75rem;
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
    text-align: center;
  }
</style>

<Popover popoverPadding="0">
  {#snippet toggle(toggleFn)}
    <Button
      variant="ghost"
      styleHeight="1.75rem"
      onclick={toggleFn}
      title="Change branch or tag">
      <div class="trigger-content">
        {#if displayPeer}
          <span class="trigger-peer">
            <span class="trigger-peer-avatar">
              <UserAvatar nodeId={displayPeer.id} styleWidth="1rem" />
            </span>
            {#if displayPeer.alias}
              <span class="trigger-peer-name">{displayPeer.alias}</span>
            {:else}
              <span class="trigger-peer-name no-alias">
                {truncateId(displayPeer.id)}
              </span>
            {/if}
            {#if displayPeer.delegate}
              <span class="trigger-delegate" title="Delegate">
                <Icon name="badge" />
              </span>
            {/if}
          </span>
          <span class="trigger-separator">/</span>
        {/if}
        <div class="trigger-ref">
          <Icon name={refType === "tag" ? "label" : "branch"} />
          <span class="trigger-name">{displayLabel()}</span>
        </div>
        {#if peer === undefined}
          <span class="canonical-badge">Canonical</span>
        {/if}
        <Icon name="chevron-down" />
      </div>
    </Button>
  {/snippet}

  {#snippet popover()}
    <div class="dropdown">
      {#if refs === undefined}
        <div class="empty">Loading…</div>
      {:else}
        <div class="header-row">
          {#if hasTags}
            <div class="tabs">
              <button
                class="tab"
                class:active={activeTab === "branches"}
                onclick={() => {
                  activeTab = "branches";
                  searchInput = "";
                }}>
                <Icon name="branch" />Branches
              </button>
              <button
                class="tab"
                class:active={activeTab === "tags"}
                onclick={() => {
                  activeTab = "tags";
                  searchInput = "";
                }}>
                <Icon name="label" />Tags
              </button>
            </div>
          {/if}
          <div class="search">
            <TextInput
              placeholder={activeTab === "branches"
                ? "Filter branches"
                : "Filter tags"}
              bind:value={searchInput}>
              {#snippet left()}
                <div
                  style:color="var(--color-text-secondary)"
                  style:padding-left="0.5rem">
                  <Icon name="filter" />
                </div>
              {/snippet}
            </TextInput>
          </div>
        </div>

        <ScrollArea style="max-height: calc(60vh - 3rem);">
          {#if debouncedSearch.current !== ""}
            {#if searchResults.total > 0}
              {#each searchResults as result (result.obj)}
                {@const el = result.obj}
                <a
                  class="result-row"
                  class:selected={isElementSelected(el)}
                  href={routeFor(el)}
                  onclick={() => closeFocused()}>
                  <div class="result-name">
                    <Icon name={el.type === "tag" ? "label" : "branch"} />
                    {#if el.peer}
                      <span class="result-peer">
                        <div class="result-peer-avatar">
                          <UserAvatar nodeId={el.peer.id} styleWidth="1rem" />
                        </div>
                        {#if el.peer.alias}
                          <span class="result-peer-name">{el.peer.alias}</span>
                        {:else}
                          <span class="result-peer-name no-alias">
                            {truncateId(el.peer.id)}
                          </span>
                        {/if}
                        {#if el.peer.delegate}
                          <span class="result-delegate" title="Delegate">
                            <Icon name="badge" />
                          </span>
                        {/if}
                      </span>
                      <span class="result-separator">/</span>
                    {/if}
                    <span class="result-name-text">{el.revision}</span>
                    {#if el.peer === undefined}
                      <span class="canonical-badge">Canonical</span>
                    {/if}
                  </div>
                  <span class="txt-id">{formatOid(el.oid)}</span>
                </a>
              {/each}
            {:else}
              <div class="empty">No matches</div>
            {/if}
          {:else if activeTab === "branches"}
            <div class="section-header">
              <span>Branch</span>
              <span>Head</span>
            </div>
            {#each [defaultBranch, ...canonicalBranchNames.filter(n => n !== defaultBranch)] as name (name)}
              <a
                class="canonical-row"
                class:selected={peer === undefined &&
                  (name === defaultBranch
                    ? onCanonicalDefault
                    : revision === name)}
                href={canonicalRouteFor(
                  name === defaultBranch ? undefined : name,
                )}
                onclick={() => closeFocused()}>
                <div class="result-name">
                  <Icon name="branch" />
                  <span class="result-name-text">{name}</span>
                  <span class="canonical-badge">Canonical</span>
                </div>
                <span class="txt-id">
                  {formatOid(
                    refs?.canonical.branches[name] ?? project.meta.head,
                  )}
                </span>
              </a>
            {/each}
          {:else if activeTab === "tags" && canonicalTagsSorted.length > 0}
            <div class="section-header">
              <span>Tag</span>
              <span>Head</span>
            </div>
            {#each canonicalTagsSorted as [name, tag] (name)}
              <a
                class="canonical-row"
                class:selected={peer === undefined && revision === name}
                href={canonicalRouteFor(name)}
                onclick={() => closeFocused()}>
                <div class="result-name">
                  <TagIcon {tag} />
                  <span class="result-name-text">{name}</span>
                  <span class="canonical-badge">Canonical</span>
                </div>
                <span class="txt-id">{formatOid(tag.oid)}</span>
              </a>
            {/each}
          {/if}

          {#if debouncedSearch.current === "" && peersForActiveTab.length > 0}
            {#if activeTab === "tags" && canonicalTagsSorted.length === 0}
              <div class="section-header">
                <span></span>
                <span>Head</span>
              </div>
            {/if}
            {#each peersForActiveTab as remote (remote.id)}
              <PeerEntry
                {baseRoute}
                {remote}
                selected={selectedPeer?.id === remote.id}
                {revision}
                tab={activeTab}
                onSelect={() => closeFocused()} />
            {/each}
          {/if}
        </ScrollArea>
      {/if}
    </div>
  {/snippet}
</Popover>
