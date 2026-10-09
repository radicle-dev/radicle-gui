<script lang="ts">
  import type { BaseUrl, NodeIdentity, NodeStats } from "@http-client";
  import type { RepoInfo } from "@app/components/RepoCard";

  import { onDestroy } from "svelte";

  import * as router from "@app/lib/router";
  import * as utils from "@app/lib/utils";
  import {
    fetchRepoInfos,
    sortRepoInfosByActivity,
  } from "@app/components/RepoCard";
  import { handleError } from "@app/views/nodes/error";

  import Badge from "@app/components/Badge.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Loading from "@app/components/Loading.svelte";
  import Placeholder from "@app/components/Placeholder.svelte";
  import RepoCard from "@app/components/RepoCard.svelte";

  export let baseUrl: BaseUrl;
  export let stats: NodeStats;
  export let user: NodeIdentity;
  export let did: { prefix: string; pubkey: string };

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

  $: if (baseUrl || did) {
    sortByActivity = false;
  }

  async function fetchRepos() {
    const repos = await fetchRepoInfos(
      baseUrl,
      { show: "all", perPage: stats.repos.total },
      utils.formatDid(did),
      newActivitySession(),
    );
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
  .subtitle {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    margin: 1rem;
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

  @media (max-width: 1010.98px) {
    .repo-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

{#await fetchRepos()}
  <div class="container">
    <Loading small center />
  </div>
{:then repos}
  {#if repos.length > 0}
    <div class="repo-grid">
      {#each displayedRepos as repoInfo (repoInfo.repo.rid)}
        <RepoCard {repoInfo} {baseUrl}>
          <svelte:fragment slot="delegate">
            <Badge
              title={`${user.alias || utils.formatNodeId(did.pubkey)} is a delegate of this repository`}
              round
              variant="delegate"
              size="tiny"
              style="padding: 0 0.372rem; gap: 0.125rem;">
              <Icon name="badge" />
            </Badge>
          </svelte:fragment>
        </RepoCard>
      {/each}
    </div>
    <div class="subtitle">
      {repos.length}
      {repos.length === 1 ? "repository" : "repositories"} ·
      <button
        class="text-button"
        disabled={sorting}
        on:click={() => toggleSortByActivity(repos)}>
        {sortByActivity ? "Default order" : "Sort by activity"}
      </button>
    </div>
  {:else}
    <div class="container">
      <Placeholder
        iconName="repository"
        caption="This user doesn’t have any repositories on this node." />
    </div>
  {/if}
{:catch error}
  {router.push(handleError(error, baseUrl))}
{/await}
