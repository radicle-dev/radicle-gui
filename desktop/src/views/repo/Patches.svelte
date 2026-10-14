<script lang="ts">
  import type { PatchStatus } from "@app/views/repo/router";
  import type { CacheEvent } from "@bindings/cob/CacheEvent";
  import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";
  import type { Patch } from "@bindings/cob/patch/Patch";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { DEFAULT_TAKE } from "@app/views/repo/router";
  import delay from "lodash/delay";

  import { searchCobs } from "@app/lib/cobSearch";
  import { debounced } from "@app/lib/debounced.svelte";
  import { channel, invoke } from "@app/lib/invoke";
  import { createListContextMenu } from "@app/lib/listContextMenu.svelte";
  import { overflowFade } from "@app/lib/overflowFade";
  import { createPaginatedList } from "@app/lib/paginatedList.svelte";
  import {
    patchCountMismatch,
    resetPatchCounts,
    updatePatchCounts,
  } from "@app/lib/patchCounts.svelte";
  import * as router from "@app/lib/router";
  import type { SidebarData } from "@app/lib/router/definitions";
  import { modifierKey } from "@app/lib/utils";

  import CobCacheWarning from "@app/components/CobCacheWarning.svelte";
  import FuzzySearch from "@app/components/FuzzySearch.svelte";
  import Icon from "@app/components/Icon.svelte";
  import NewPatchButton from "@app/components/NewPatchButton.svelte";
  import PatchContextMenu from "@app/components/PatchContextMenu.svelte";
  import PatchTeaser from "@app/components/PatchTeaser.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import Topbar from "@app/components/Topbar.svelte";
  import VirtualList from "@app/components/VirtualList.svelte";

  import Layout from "./Layout.svelte";

  interface Props {
    repo: RepoInfo;
    patches: PaginatedQuery<Patch[]>;
    status: PatchStatus | undefined;
    sidebarData: SidebarData;
  }

  /* eslint-disable prefer-const */
  let { repo, patches, status, sidebarData }: Props = $props();
  /* eslint-enable prefer-const */

  function listKey(filter: PatchStatus | undefined): string {
    return `repo.patches:${repo.rid}:${filter ?? "all"}`;
  }

  let loading = $state(false);
  let searchInput = $state("");
  const debouncedSearch = debounced(() => searchInput, 150);
  let showSearch = $state(false);
  let cacheState: CacheEvent | undefined = $state();
  // Height of the cache-warning banner above the list; fed to the virtualizer
  // as a start offset since it shares the same scroll viewport.
  let chromeHeight = $state(0);

  const project = $derived(repo.payloads["xyz.radicle.project"]!);

  const list = createPaginatedList<Patch>({
    key: () => listKey(status),
    page: () => patches,
    fetchPage: (skip, take) =>
      invoke<PaginatedQuery<Patch[]>>("list_patches", {
        rid: repo.rid,
        status,
        skip,
        take,
      }),
    pageSize: DEFAULT_TAKE,
    id: patch => patch.id,
    skipPersist: () => searchInput !== "",
  });

  $effect(() => {
    // Only record counts from settled, fresh data: while a history-restore
    // revalidation is in flight (loadingMore), the snapshot's length/more are
    // stale and would flag a cache mismatch that isn't there.
    if (list.more === false && !list.loadingMore) {
      updatePatchCounts(list.items.length, project.meta.patches, status);
    }
  });

  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    status;

    searchInput = "";
    showSearch = false;
  });

  async function rebuildPatchCache() {
    try {
      await invoke("rebuild_patch_cache", {
        rid: repo.rid,
        onEvent: channel<CacheEvent>(message => {
          cacheState = message;
        }),
      });
    } catch (error) {
      console.error(error);
    } finally {
      await list.revalidate();
      resetPatchCounts();

      delay(() => {
        cacheState = undefined;
      }, 1500);
    }
  }

  const contextMenu = createListContextMenu(() => list.items);

  async function refresh() {
    // Re-fetch the repo too: the tab counts come from its project payload.
    const [repoInfo] = await Promise.all([
      invoke<RepoInfo>("repo_by_id", { rid: repo.rid }),
      list.revalidate(Math.max(list.items.length, DEFAULT_TAKE)),
    ]);
    repo = repoInfo;
  }

  const searchResults = $derived(
    searchCobs(debouncedSearch.current, list.items),
  );
</script>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .topbar-title {
    font: var(--txt-body-m-semibold);
    color: var(--color-text-secondary);
    padding-right: 0.25rem;
  }
  .filters {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .filter {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    padding: 0.25rem 0.5rem;
    border-radius: var(--border-radius-sm);
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
  }
  .filter:hover {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .filter.active {
    background-color: var(--color-surface-subtle);
  }
  .filter .global-counter-badge {
    margin-left: 0.25rem;
  }
  .filter-label {
    display: none;
  }
  .filter.active .filter-label {
    display: inline;
  }
  @container (min-width: 54rem) {
    .filter-label {
      display: inline;
    }
  }
  .filters.compact .filter:not(.active) .filter-label {
    display: none;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    flex-shrink: 0;
  }
  .search {
    display: flex;
  }
  .search.expanded {
    width: 16rem;
  }
  @container (max-width: 54rem) {
    .search.expanded {
      width: 10rem;
    }
  }
  .row {
    border-bottom: 1px solid var(--color-border-subtle);
  }
</style>

<Layout selfScroll>
  <div class="page">
    <Topbar>
      <span class="topbar-title">Patches</span>
      <div class="filters" class:compact={showSearch} use:overflowFade>
        <a
          class="filter"
          class:active={status === undefined}
          href={router.routeToPath({
            resource: "repo.patches",
            rid: repo.rid,
            status: undefined,
          })}>
          <Icon name="patch" />
          <span class="filter-label">All</span>
          <span class="global-counter-badge">
            {project.meta.patches.open +
              project.meta.patches.draft +
              project.meta.patches.archived +
              project.meta.patches.merged}
          </span>
        </a>
        <a
          class="filter"
          class:active={status === "open"}
          href={router.routeToPath({
            resource: "repo.patches",
            rid: repo.rid,
            status: "open",
          })}>
          <Icon name="patch" />
          <span class="filter-label">Open</span>
          <span class="global-counter-badge">{project.meta.patches.open}</span>
        </a>
        <a
          class="filter"
          class:active={status === "merged"}
          href={router.routeToPath({
            resource: "repo.patches",
            rid: repo.rid,
            status: "merged",
          })}>
          <Icon name="patch-merged" />
          <span class="filter-label">Merged</span>
          <span class="global-counter-badge">
            {project.meta.patches.merged}
          </span>
        </a>
        <a
          class="filter"
          class:active={status === "archived"}
          href={router.routeToPath({
            resource: "repo.patches",
            rid: repo.rid,
            status: "archived",
          })}>
          <Icon name="patch-archived" />
          <span class="filter-label">Archived</span>
          <span class="global-counter-badge">
            {project.meta.patches.archived}
          </span>
        </a>
        <a
          class="filter"
          class:active={status === "draft"}
          href={router.routeToPath({
            resource: "repo.patches",
            rid: repo.rid,
            status: "draft",
          })}>
          <Icon name="patch-draft" />
          <span class="filter-label">Drafts</span>
          <span class="global-counter-badge">{project.meta.patches.draft}</span>
        </a>
      </div>
      <div class="actions">
        <div class="search" class:expanded={showSearch}>
          <FuzzySearch
            hasItems={list.items.length > 0}
            placeholder={`Search patches ${modifierKey()} + f`}
            icon={loading ? "clock" : "search"}
            onFocus={async () => {
              try {
                loading = true;
                await list.loadMore(true);
              } catch (e) {
                console.error("Loading all patches failed: ", e);
              } finally {
                loading = false;
              }
            }}
            onSubmit={async () => {
              if (searchResults.length === 1) {
                await router.push({
                  patch: searchResults[0].id,
                  resource: "repo.patch",
                  reviewId: undefined,
                  rid: repo.rid,
                  status,
                });
              }
            }}
            bind:show={showSearch}
            bind:value={searchInput} />
        </div>
        <NewPatchButton rid={repo.rid} />
      </div>
    </Topbar>

    {#if searchResults.length === 0}
      {#if patchCountMismatch(status)}
        <CobCacheWarning
          noun="patches"
          {cacheState}
          onRebuild={rebuildPatchCache} />
      {/if}
      <div
        class="global-flex"
        style:flex="1"
        style:justify-content="center"
        style:align-items="center">
        <div
          class="txt-missing txt-body-m-regular global-flex"
          style:gap="0.25rem">
          {#if list.items.length > 0}
            No matching patches
          {:else}
            No {status === undefined ? "" : status} patches
          {/if}
        </div>
      </div>
    {:else}
      <ScrollArea style="height: 100%; min-width: 0;">
        <div bind:clientHeight={chromeHeight}>
          {#if patchCountMismatch(status)}
            <CobCacheWarning
              noun="patches"
              {cacheState}
              onRebuild={rebuildPatchCache} />
          {/if}
        </div>
        <VirtualList
          items={searchResults}
          hasMore={list.more}
          loadingMore={list.loadingMore}
          onLoadMore={() => list.loadMore()}
          startMargin={chromeHeight}
          estimatedItemSize={80}
          getKey={patch => patch.id}
          initialCache={list.initialCache}
          initialScrollOffset={list.initialScrollOffset}
          onRestored={list.consumeRestoredScroll}
          onState={list.persistScroll}>
          {#snippet row(patch)}
            <div class="row">
              <PatchTeaser
                contextActive={contextMenu.isActive(patch.id)}
                oncontextmenu={event => contextMenu.open(event, patch.id)}
                focussed={searchResults.length === 1 && searchInput !== ""}
                {patch}
                rid={repo.rid}
                {status} />
            </div>
          {/snippet}
        </VirtualList>
      </ScrollArea>
    {/if}
  </div>

  {#if contextMenu.current}
    {@const { x, y, target, item } = contextMenu.current}
    <PatchContextMenu
      {x}
      {y}
      {target}
      patch={item}
      {repo}
      config={sidebarData.config}
      labelSuggestions={contextMenu.labelSuggestions}
      onchange={refresh}
      onclose={contextMenu.close} />
  {/if}
</Layout>
