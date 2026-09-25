<script lang="ts">
  import type { BaseUrl, Patch, PatchState, Repo } from "@http-client";
  import type { CobFilters } from "./router";

  import { HttpdClient } from "@http-client";

  import {
    PATCHES_PER_PAGE,
    currentCobFilters,
    fetchPatchesPage,
    hasCobFilters,
    patchesSearch,
  } from "./router";
  import { push, replace } from "@app/lib/router";
  import { baseUrlToString } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import CobFilterRow from "./CobFilterRow.svelte";
  import CobSearch from "./CobSearch.svelte";
  import ErrorMessage from "@app/components/ErrorMessage.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Layout from "./Layout.svelte";
  import Link from "@app/components/Link.svelte";
  import List from "@app/components/List.svelte";
  import Loading from "@app/components/Loading.svelte";
  import PatchTeaser from "./Patch/PatchTeaser.svelte";
  import Placeholder from "@app/components/Placeholder.svelte";
  import Separator from "./Separator.svelte";

  export let baseUrl: BaseUrl;
  export let patches: Patch[];
  export let repo: Repo;
  export let repoId: string;
  export let status: PatchState["status"];
  export let nodeId: string;
  export let nodeAvatarUrl: string | undefined;
  export let filters: CobFilters;
  export let searchAvailable: boolean;

  let loading = false;
  let page = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let error: any;
  let allPatches: Patch[];
  let filtersOpen = false;

  $: filtersActive = Boolean(
    filters.author || filters.assignee || filters.label,
  );
  $: showFilterRow = searchAvailable && (filtersOpen || filtersActive);

  $: {
    allPatches = patches;
    page = 0;
  }

  const api = new HttpdClient(baseUrl);

  async function loadMore(status: PatchState["status"]): Promise<void> {
    loading = true;
    page += 1;
    try {
      const response = await fetchPatchesPage(
        api,
        repo.rid,
        status,
        filters,
        page,
      );
      allPatches = [...allPatches, ...response];
    } catch (e) {
      error = e;
    } finally {
      loading = false;
    }
  }

  function search(event: CustomEvent<string | undefined>) {
    void replace({
      resource: "repo.patches",
      repo: repoId,
      node: baseUrl,
      search: patchesSearch(status, {
        ...currentCobFilters(),
        q: event.detail,
      }),
    });
  }

  function applyFilters(event: CustomEvent<Omit<CobFilters, "q">>) {
    void push({
      resource: "repo.patches",
      repo: repoId,
      node: baseUrl,
      search: patchesSearch(status, {
        ...currentCobFilters(),
        ...event.detail,
      }),
    });
  }

  $: totalForStatus = repo.payloads["xyz.radicle.project"].meta.patches[status];
  $: showEmpty = hasCobFilters(filters)
    ? allPatches.length === 0 && !loading && !error
    : totalForStatus === 0;

  $: showMoreButton =
    !loading &&
    !error &&
    (hasCobFilters(filters)
      ? allPatches.length === (page + 1) * PATCHES_PER_PAGE
      : allPatches.length < totalForStatus);
</script>

<style>
  .header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .more {
    margin-top: 2rem;
    min-height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .counter {
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-mid);
    color: var(--color-text-tertiary);
    padding: 0 0.25rem;
    min-width: 1.5rem;
    text-align: center;
  }
  .selected {
    background-color: var(--color-surface-alpha-subtle);
    color: var(--color-text-primary);
  }
  .title-counter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .placeholder {
    height: calc(100% - 4rem);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  @media (max-width: 719.98px) {
    .placeholder {
      height: calc(100vh - 10rem);
    }
    .title-counter:not(.active) {
      display: none;
    }
  }
</style>

<Layout {nodeId} {nodeAvatarUrl} {baseUrl} {repo} {repoId} activeTab="patches">
  <svelte:fragment slot="breadcrumb">
    <Separator />
    <Link
      route={{
        resource: "repo.patches",
        repo: repoId,
        node: baseUrl,
      }}>
      Patches
    </Link>
  </svelte:fragment>
  <div slot="header" class="header">
    <Link
      route={{
        resource: "repo.patches",
        repo: repoId,
        node: baseUrl,
        search: patchesSearch("open", filters),
      }}>
      <Button variant={status === "open" ? "gray" : "background"}>
        <Icon name="patch" />
        <div class="title-counter" class:active={status === "open"}>
          Open
          <span class="counter" class:selected={status === "open"}>
            {repo.payloads["xyz.radicle.project"].meta.patches.open}
          </span>
        </div>
      </Button>
    </Link>
    <Link
      route={{
        resource: "repo.patches",
        repo: repoId,
        node: baseUrl,
        search: patchesSearch("draft", filters),
      }}>
      <Button variant={status === "draft" ? "gray" : "background"}>
        <Icon name="patch-draft" />
        <div class="title-counter" class:active={status === "draft"}>
          Draft
          <span class="counter" class:selected={status === "draft"}>
            {repo.payloads["xyz.radicle.project"].meta.patches.draft}
          </span>
        </div>
      </Button>
    </Link>
    <Link
      route={{
        resource: "repo.patches",
        repo: repoId,
        node: baseUrl,
        search: patchesSearch("archived", filters),
      }}>
      <Button variant={status === "archived" ? "gray" : "background"}>
        <Icon name="patch-archived" />
        <div class="title-counter" class:active={status === "archived"}>
          Archived
          <span class="counter" class:selected={status === "archived"}>
            {repo.payloads["xyz.radicle.project"].meta.patches.archived}
          </span>
        </div>
      </Button>
    </Link>
    <Link
      route={{
        resource: "repo.patches",
        repo: repoId,
        node: baseUrl,
        search: patchesSearch("merged", filters),
      }}>
      <Button variant={status === "merged" ? "gray" : "background"}>
        <Icon name="patch-merged" />
        <div class="title-counter" class:active={status === "merged"}>
          Merged
          <span class="counter" class:selected={status === "merged"}>
            {repo.payloads["xyz.radicle.project"].meta.patches.merged}
          </span>
        </div>
      </Button>
    </Link>
    {#if searchAvailable}
      <CobSearch
        value={filters.q}
        placeholder="Search patches…"
        on:search={search} />
      <Button
        variant={showFilterRow ? "gray" : "background"}
        disabled={filtersActive}
        on:click={() => (filtersOpen = !filtersOpen)}>
        <Icon name="filter" />
        Filter
      </Button>
    {/if}
  </div>

  <div slot="subheader">
    {#if showFilterRow}
      <CobFilterRow {filters} on:change={applyFilters} />
    {/if}
  </div>

  <List items={allPatches}>
    <PatchTeaser slot="item" let:item {baseUrl} {repoId} patch={item} />
  </List>

  {#if error}
    <ErrorMessage
      title="Couldn’t load patches"
      description="Please make sure you are able to connect to the seed:"
      seed={baseUrlToString(api.baseUrl)}
      {error} />
  {/if}

  {#if showEmpty}
    <div class="placeholder">
      <Placeholder
        iconName="patch"
        caption={hasCobFilters(filters)
          ? "No patches match"
          : `No ${status} patches`} />
    </div>
  {/if}

  {#if loading || showMoreButton}
    <div class="more">
      {#if loading}
        <div style:margin-top={page === 0 ? "8rem" : ""}>
          <Loading noDelay small={page !== 0} center />
        </div>
      {/if}

      {#if showMoreButton}
        <Button
          size="large"
          variant="outline"
          on:click={() => loadMore(status)}>
          More
        </Button>
      {/if}
    </div>
  {/if}
</Layout>
