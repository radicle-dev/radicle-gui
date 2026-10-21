<script lang="ts">
  import type { BaseUrl, Repo } from "@http-client";
  import type { RepoInfo } from "@app/components/RepoCard";
  import type { ExploreSection } from "./sections";

  import { HttpdClient } from "@http-client";
  import { fetchRepoInfos } from "@app/components/RepoCard";
  import { loadRepoActivity } from "@app/lib/commit";
  import * as router from "@app/lib/router";
  import { handleError } from "@app/views/nodes/error";

  import Icon from "@app/components/Icon.svelte";
  import Link from "@app/components/Link.svelte";
  import RepoCard from "@app/components/RepoCard.svelte";
  import RepoCardSkeleton from "@app/components/RepoCardSkeleton.svelte";

  export let baseUrl: BaseUrl;
  export let section: ExploreSection;

  const MAX_STATIC_RIDS = 9;

  $: skeletonCount =
    section.kind === "static"
      ? Math.min(section.rids.length, MAX_STATIC_RIDS)
      : section.limit;

  async function fetchStaticRepos(
    url: BaseUrl,
    rids: string[],
  ): Promise<RepoInfo[]> {
    const api = new HttpdClient(url);
    const limited = rids.slice(0, MAX_STATIC_RIDS);

    const results = await Promise.allSettled(
      limited.map(rid => api.repo.getByRid(rid)),
    );

    const repos: Repo[] = results
      .filter(
        (r): r is PromiseFulfilledResult<Repo> => r.status === "fulfilled",
      )
      .map(r => r.value)
      .filter(r => Boolean(r.payloads["xyz.radicle.project"]));

    return repos.map(repo => ({
      repo,
      baseUrl: url,
      activity: loadRepoActivity(repo.rid, url).catch(() => []),
    }));
  }

  async function fetchSectionRepos(
    url: BaseUrl,
    sec: ExploreSection,
  ): Promise<RepoInfo[]> {
    if (sec.kind === "static") {
      return fetchStaticRepos(url, sec.rids);
    }
    if (sec.kind === "pinned") {
      // Omit perPage so httpd defaults to "all configured pinned repos".
      return fetchRepoInfos(url, {
        show: "pinned",
        page: 0,
      });
    }
    const sort = sec.kind === "recentlyActive" ? "activity" : "seeding";
    return fetchRepoInfos(url, {
      show: "all",
      sort,
      perPage: sec.limit,
      page: 0,
    });
  }

  $: dataPromise = fetchSectionRepos(baseUrl, section);
</script>

<style>
  .section {
    margin-bottom: 2.5rem;
  }
  .section:last-child {
    margin-bottom: 0;
  }
  .header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin-bottom: 1rem;
    padding: 0 1rem;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-header-medium);
  }
  .title-icon {
    color: var(--color-text-tertiary);
    display: flex;
    align-items: center;
  }
  .view-all {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
  .view-all:hover {
    color: var(--color-text-primary);
    text-decoration: underline;
  }
  .repo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(28rem, 1fr));
    gap: 0;
  }
  .card-fade-in {
    animation: card-fade-in 280ms ease-out;
  }
  .empty {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    padding: 1rem;
  }
  @keyframes card-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .card-fade-in {
      animation: none;
    }
  }

  @media (max-width: 1010.98px) {
    .repo-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .header {
      padding: 0;
    }
  }
</style>

<div class="section">
  <div class="header">
    <div class="title">
      <span class="title-icon"><Icon name={section.icon} /></span>
      {section.title}
    </div>
    {#if section.kind === "pinned"}
      <Link
        route={{
          resource: "explore.repos",
          params: { page: 0, sort: "rid" },
        }}>
        <span class="view-all">View all repositories →</span>
      </Link>
    {:else}
      <Link
        route={{
          resource: "explore.repos",
          params: {
            page: 0,
            sort: section.kind === "recentlyActive" ? "activity" : "seeding",
          },
        }}>
        <span class="view-all">View all →</span>
      </Link>
    {/if}
  </div>

  {#await dataPromise}
    <div class="repo-grid">
      {#each Array.from({ length: skeletonCount }) as _}
        <RepoCardSkeleton />
      {/each}
    </div>
  {:then repoInfos}
    {#if repoInfos.length > 0}
      <div class="repo-grid">
        {#each repoInfos as repoInfo (repoInfo.repo.rid)}
          <div class="card-fade-in">
            <RepoCard {baseUrl} {repoInfo} />
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty">No repos to show.</div>
    {/if}
  {:catch error}
    {router.push(handleError(error, baseUrl))}
  {/await}
</div>
