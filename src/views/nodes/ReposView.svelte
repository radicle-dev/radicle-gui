<script lang="ts">
  import type { BaseUrl, NodeStats } from "@http-client";
  import type { RepoInfo } from "@app/components/RepoCard";

  import { onDestroy } from "svelte";

  import * as router from "@app/lib/router";
  import {
    fetchRepoInfos,
    sortRepoInfosByActivity,
  } from "@app/components/RepoCard";
  import { handleError } from "@app/views/nodes/error";

  import Loading from "@app/components/Loading.svelte";
  import Placeholder from "@app/components/Placeholder.svelte";
  import RepoCard from "@app/components/RepoCard.svelte";

  export let baseUrl: BaseUrl;
  export let stats: NodeStats;

  let listState: "pinned" | "all" = "pinned";
  let page = 0;
  let hasPinnedRepos = true;
  let sortByActivity = false;
  let sorting = false;
  let displayedRepos: RepoInfo[] = [];

  let activityAbort: AbortController | undefined;

  function newActivitySession(): AbortSignal {
    activityAbort?.abort();
    activityAbort = new AbortController();
    return activityAbort.signal;
  }

  onDestroy(() => activityAbort?.abort());

  // Reset state when baseUrl changes
  $: if (baseUrl) {
    listState = "pinned";
    page = 0;
    hasPinnedRepos = true;
    sortByActivity = false;
  }

  $: perPage = listState === "pinned" ? stats.repos.total : 24;
  $: totalPages = Math.ceil(stats.repos.total / perPage);

  function showPinned() {
    listState = "pinned";
    page = 0;
    sortByActivity = false;
  }

  function showAll() {
    listState = "all";
    page = 0;
    sortByActivity = false;
  }

  async function fetchRepos(
    show: "pinned" | "all",
    perPage: number,
    page: number,
  ) {
    const repos = await fetchRepoInfos(
      baseUrl,
      { show, perPage, page },
      undefined,
      newActivitySession(),
    );

    if (
      hasPinnedRepos &&
      show === "pinned" &&
      page === 0 &&
      repos.length === 0
    ) {
      hasPinnedRepos = false;
      listState = "all";
      return [];
    }

    sortByActivity = false;
    displayedRepos = repos;
    return repos;
  }

  async function toggleSortByActivity(repos: RepoInfo[]) {
    if (sortByActivity) {
      sortByActivity = false;
      displayedRepos = repos;
      return;
    }
    sorting = true;
    try {
      displayedRepos = await sortRepoInfosByActivity(repos);
      sortByActivity = true;
    } finally {
      sorting = false;
    }
  }
</script>

<style>
  .subtitle,
  .pagination {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .pagination {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
  }
  .repos {
    margin-top: 0;
  }
  .repo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(32rem, 1fr));
    gap: 0;
  }
  .container {
    display: grid;
    place-items: center;
    min-height: calc(100vh - var(--global-header-height));
    font: var(--txt-body-m-regular);
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
  .footer {
    display: flex;
    gap: 0.5rem 1rem;
    margin: 1rem;
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
</style>

<div class="repos">
  {#await fetchRepos(listState, perPage, page)}
    <div class="container">
      <Loading small center />
    </div>
  {:then repoInfos}
    {#if repoInfos.length > 0}
      <div class="repo-grid">
        {#each displayedRepos as repoInfo (repoInfo.repo.rid)}
          <RepoCard {baseUrl} {repoInfo} />
        {/each}
      </div>
      <div class="footer">
        {#if listState === "pinned"}
          <div class="subtitle">
            {repoInfos.length}
            pinned {repoInfos.length === 1 ? "repository" : "repositories"} ·
            <button
              class="text-button"
              disabled={sorting}
              on:click={() => toggleSortByActivity(repoInfos)}>
              {sortByActivity ? "Default order" : "Sort by activity"}
            </button>
            ·
            <button class="text-button" on:click={showAll}>Browse all</button>
          </div>
        {:else}
          <div class="subtitle">
            {stats.repos.total.toLocaleString()}
            seeded {stats.repos.total === 1 ? "repository" : "repositories"}
            {#if hasPinnedRepos}
              ·
              <button class="text-button" on:click={showPinned}>
                See pinned
              </button>
            {/if}
          </div>

          {#if totalPages > 1}
            <div class="pagination">
              {#if page !== 0}
                <button class="text-button" on:click={() => (page = page - 1)}>
                  Previous
                </button>
                ·
              {/if}

              {#each Array.from({ length: Math.min(totalPages, 7) }) as _, i}
                {@const startPage = Math.max(page - 3, 0)}
                {@const pageNumber = startPage + i}
                <button
                  class="text-button"
                  class:current-page={page === pageNumber}
                  on:click={() => (page = pageNumber)}
                  disabled={page === pageNumber}>
                  {pageNumber + 1}
                </button>
              {/each}

              {#if page !== totalPages - 1}
                ·
                <button class="text-button" on:click={() => (page = page + 1)}>
                  Next
                </button>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    {:else}
      <div class="container">
        {#if listState === "pinned"}
          <Placeholder
            iconName="repository"
            caption="This node doesn’t have any pinned repositories." />
        {:else}
          <Placeholder
            iconName="repository"
            caption="This node doesn’t seed any repositories." />
        {/if}
      </div>
    {/if}
  {:catch error}
    {router.push(handleError(error, baseUrl))}
  {/await}
</div>
