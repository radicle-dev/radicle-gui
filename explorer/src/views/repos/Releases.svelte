<script lang="ts">
  import type { BaseUrl, Release, Repo } from "@http-client";

  import { HttpdClient } from "@http-client";
  import { RELEASES_PER_PAGE } from "./router";
  import { baseUrlToString } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import ErrorMessage from "@app/components/ErrorMessage.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Layout from "./Layout.svelte";
  import Link from "@app/components/Link.svelte";
  import List from "@app/components/List.svelte";
  import Loading from "@app/components/Loading.svelte";
  import Placeholder from "@app/components/Placeholder.svelte";
  import ReleaseTeaser from "@app/views/repos/Release/ReleaseTeaser.svelte";
  import Separator from "./Separator.svelte";

  export let baseUrl: BaseUrl;
  export let releases: Release[];
  export let repo: Repo;
  export let repoId: string;
  export let allAuthors: boolean;
  export let showFilters: boolean;
  export let nodeId: string;
  export let nodeAvatarUrl: string | undefined;

  let loading = false;
  let page = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let error: any;
  let allReleases: Release[];

  $: {
    allReleases = releases;
    page = 0;
  }

  $: delegateIds = new Set(repo.delegates.map(d => d.id));
  // The delegate count isn't in repo metadata; derive it from the loaded
  // pages. It labels the segment only, and reads as "30+" while pages are
  // outstanding; whether the segments show at all is settled by the router.
  $: delegateReleaseCount = allAuthors
    ? allReleases.filter(r => delegateIds.has(r.creator.id)).length
    : allReleases.length;

  $: releaseCount = repo.payloads["xyz.radicle.project"].meta.releases;

  const api = new HttpdClient(baseUrl);

  async function loadReleases(): Promise<void> {
    loading = true;
    // Only advance the cursor once the page is in hand, so a failed load
    // doesn't leave a gap behind on retry.
    const next = page + 1;
    try {
      const response = await api.repo.getAllReleases(repo.rid, {
        allAuthors,
        page: next,
        perPage: RELEASES_PER_PAGE,
      });
      allReleases = [...allReleases, ...response];
      page = next;
    } catch (e) {
      error = e;
    } finally {
      loading = false;
    }
  }

  // The count for the current filter isn't in repo metadata, so offer "More"
  // whenever every loaded page came back full; a short page means we've reached
  // the end.
  $: showMoreButton =
    !loading && !error && allReleases.length === (page + 1) * RELEASES_PER_PAGE;
</script>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
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
  .hover {
    background-color: var(--color-surface-strong);
    color: var(--color-text-primary);
  }
  .title-counter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .more {
    margin-top: 2rem;
    min-height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
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
  }
</style>

<Layout {nodeId} {nodeAvatarUrl} {baseUrl} {repo} {repoId} activeTab="releases">
  <svelte:fragment slot="breadcrumb">
    <Separator />
    <Link
      route={{
        resource: "repo.releases",
        repo: repoId,
        node: baseUrl,
      }}>
      Releases
    </Link>
  </svelte:fragment>
  <svelte:fragment slot="header">
    {#if showFilters}
      <div class="header">
        <Link
          route={{ resource: "repo.releases", repo: repoId, node: baseUrl }}>
          <Button let:hover variant={!allAuthors ? "gray" : "background"}>
            <Icon name="badge" />
            <div class="title-counter">
              Delegates
              <span
                class="counter"
                class:selected={!allAuthors}
                class:hover={hover && allAuthors}>
                {delegateReleaseCount}{showMoreButton ? "+" : ""}
              </span>
            </div>
          </Button>
        </Link>
        <Link
          route={{
            resource: "repo.releases",
            repo: repoId,
            node: baseUrl,
            allAuthors: true,
          }}>
          <Button let:hover variant={allAuthors ? "gray" : "background"}>
            <Icon name="avatar-incognito" />
            <div class="title-counter">
              All
              {#if releaseCount !== undefined}
                <span
                  class="counter"
                  class:selected={allAuthors}
                  class:hover={hover && !allAuthors}>
                  {releaseCount}
                </span>
              {/if}
            </div>
          </Button>
        </Link>
      </div>
    {/if}
  </svelte:fragment>

  <List items={allReleases}>
    <ReleaseTeaser
      slot="item"
      let:item
      {baseUrl}
      {repoId}
      {allAuthors}
      {delegateIds}
      release={item} />
  </List>

  {#if error}
    <ErrorMessage
      title="Couldn't load releases"
      description="Please make sure you are able to connect to the seed:"
      seed={baseUrlToString(api.baseUrl)}
      {error} />
  {/if}

  {#if allReleases.length === 0 && !error}
    <div class="placeholder">
      <Placeholder
        iconName="parcel"
        caption={showFilters && !allAuthors
          ? "No releases by delegates"
          : "No releases"} />
    </div>
  {/if}

  {#if loading || showMoreButton}
    <div class="more">
      {#if loading}
        <Loading noDelay small center />
      {/if}

      {#if showMoreButton}
        <Button size="large" variant="outline" on:click={loadReleases}>
          More
        </Button>
      {/if}
    </div>
  {/if}
</Layout>
