<script lang="ts">
  import type { BaseUrl, NodeStats } from "@http-client";
  import type { ExploreReposSort } from "./router";

  import * as router from "@app/lib/router";
  import { fetchRepoInfos } from "@app/components/RepoCard";
  import { handleError } from "@app/views/nodes/error";

  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownList/DropdownListItem.svelte";
  import Header from "@app/components/Header.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Link from "@app/components/Link.svelte";
  import Loading from "@app/components/Loading.svelte";
  import Placeholder from "@app/components/Placeholder.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import RepoCard from "@app/components/RepoCard.svelte";
  import Separator from "@app/views/repos/Separator.svelte";

  export let baseUrl: BaseUrl;
  export let stats: NodeStats;
  export let page: number;
  export let sort: ExploreReposSort;
  export let searchAvailable: boolean;

  const perPage = 24;

  const sortOptions: { value: ExploreReposSort; label: string }[] = [
    { value: "activity", label: "Recently active" },
    { value: "seeding", label: "Most seeded" },
  ];

  const allLabels: Record<ExploreReposSort, string> = {
    rid: "All repos",
    activity: "Recently active",
    seeding: "Most seeded",
  };

  // When the seed has no search backend, activity/seeding sorts hit the
  // slow storage-walk path on httpd, so the dropdown is hidden and we
  // force the listing back to rid order. The URL's `sort` is left as-is
  // so the preference resumes if the user picks a search-capable seed.
  $: effectiveSort = searchAvailable ? sort : "rid";
  $: totalPages = Math.max(1, Math.ceil(stats.repos.total / perPage));
  $: subtitle = allLabels[effectiveSort];

  // Re-evaluates whenever baseUrl, page, or sort change so switching seeds
  // (which only changes baseUrl) refetches.
  $: reposPromise = fetchRepos(baseUrl, page, effectiveSort);

  async function fetchRepos(
    currentBaseUrl: BaseUrl,
    currentPage: number,
    currentSort: ExploreReposSort,
  ) {
    return fetchRepoInfos(currentBaseUrl, {
      show: "all",
      sort: currentSort,
      perPage,
      page: currentPage,
    });
  }

  function goToPage(target: number) {
    void router.push({
      resource: "explore.repos",
      params: { page: target, sort },
    });
  }

  function selectSort(value: ExploreReposSort) {
    closeFocused();
    if (value === sort) return;
    void router.push({
      resource: "explore.repos",
      params: { page: 0, sort: value },
    });
  }
</script>

<style>
  .page {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - var(--global-header-height));
  }
  .container {
    width: 100%;
    max-width: 86rem;
    margin: 0 auto;
    padding: 3rem 1rem;
  }
  .breadcrumbs {
    display: flex;
    align-items: center;
    column-gap: 0.25rem;
    font: var(--txt-body-m-regular);
    white-space: nowrap;
    flex-wrap: wrap;
  }
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .breadcrumb :global(a:hover) {
    color: var(--color-text-brand);
  }
  .breadcrumb-current {
    color: var(--color-text-secondary);
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    padding: 0 1rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .sort-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.5rem 0.375rem 0.75rem;
    background: transparent;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    color: var(--color-text-primary);
    font: var(--txt-body-m-regular);
    cursor: pointer;
  }
  .sort-trigger:hover {
    background-color: var(--color-surface-mid);
  }
  .sort-label-muted {
    color: var(--color-text-tertiary);
  }
  .repo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(28rem, 1fr));
    gap: 0;
  }
  .loading {
    display: grid;
    place-items: center;
    min-height: 12rem;
  }
  .footer {
    display: flex;
    gap: 0.5rem 1rem;
    margin-top: 1rem;
    padding: 0 1rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .pagination {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
  }
  .text-button {
    background: none;
    border: none;
    font: inherit;
    color: inherit;
    margin: 0;
    padding: 0;
  }
  .text-button:not(:disabled) {
    cursor: pointer;
  }
  .text-button:hover:not(:disabled) {
    text-decoration: underline;
  }
  .current-page {
    text-decoration: underline;
  }

  @media (max-width: 1010.98px) {
    .repo-grid {
      grid-template-columns: 1fr;
    }
    .footer {
      flex-direction: column;
    }
    .pagination {
      margin-left: 0;
    }
  }

  @media (max-width: 720px) {
    .toolbar,
    .footer {
      padding: 0;
    }
  }
</style>

<Header />

<div class="page">
  <div class="container">
    <div class="toolbar">
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <span class="breadcrumb">
          <Link route={{ resource: "explore", params: undefined }}>
            Explore
          </Link>
        </span>
        <Separator />
        <span class="breadcrumb breadcrumb-current">{subtitle}</span>
      </nav>
      {#if searchAvailable}
        <Popover popoverPositionTop="2.5rem" popoverPositionRight="0">
          <button
            slot="toggle"
            let:toggle
            on:click={toggle}
            class="sort-trigger"
            aria-label="Sort">
            <span class="sort-label-muted">Sort:</span>
            {subtitle}
            <Icon name="chevron-down" />
          </button>
          <svelte:fragment slot="popover">
            <DropdownList items={sortOptions} styleDropdownMinWidth="12rem">
              <DropdownListItem
                slot="item"
                let:item
                on:click={() => selectSort(item.value)}
                selected={item.value === sort}>
                {item.label}
              </DropdownListItem>
            </DropdownList>
          </svelte:fragment>
        </Popover>
      {/if}
    </div>

    {#await reposPromise}
      <div class="loading">
        <Loading small center />
      </div>
    {:then repoInfos}
      {#if repoInfos.length > 0}
        <div class="repo-grid">
          {#each repoInfos as repoInfo (repoInfo.repo.rid)}
            <RepoCard {baseUrl} {repoInfo} />
          {/each}
        </div>
        <div class="footer">
          <div>
            {stats.repos.total.toLocaleString()}
            {stats.repos.total === 1 ? "repository" : "repositories"}
          </div>
          {#if totalPages > 1}
            <div class="pagination">
              {#if page !== 0}
                <button class="text-button" on:click={() => goToPage(page - 1)}>
                  Previous
                </button>
                ·
              {/if}

              {#each Array.from({ length: Math.min(totalPages, 7) }) as _, i}
                {@const startPage = Math.max(page - 3, 0)}
                {@const pageNumber = startPage + i}
                {#if pageNumber < totalPages}
                  <button
                    class="text-button"
                    class:current-page={page === pageNumber}
                    on:click={() => goToPage(pageNumber)}
                    disabled={page === pageNumber}>
                    {pageNumber + 1}
                  </button>
                {/if}
              {/each}

              {#if page !== totalPages - 1}
                ·
                <button class="text-button" on:click={() => goToPage(page + 1)}>
                  Next
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <div class="loading">
          <Placeholder
            iconName="repository"
            caption="No repositories to show." />
        </div>
      {/if}
    {:catch error}
      {router.push(handleError(error, baseUrl))}
    {/await}
  </div>
</div>
