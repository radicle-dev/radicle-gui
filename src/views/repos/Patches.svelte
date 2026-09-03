<script lang="ts">
  import type { BaseUrl, Patch, PatchState, Repo } from "@http-client";

  import { HttpdClient } from "@http-client";

  import { PATCHES_PER_PAGE } from "./router";
  import { baseUrlToString } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
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

  let loading = false;
  let page = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let error: any;
  let allPatches: Patch[];

  $: {
    allPatches = patches;
    page = 0;
  }

  const api = new HttpdClient(baseUrl);

  async function loadMore(status: PatchState["status"]): Promise<void> {
    loading = true;
    page += 1;
    try {
      const response = await api.repo.getAllPatches(repo.rid, {
        status,
        page,
        perPage: PATCHES_PER_PAGE,
      });
      allPatches = [...allPatches, ...response];
    } catch (e) {
      error = e;
    } finally {
      loading = false;
    }
  }

  // Without a count, offer more while every loaded page came back full.
  $: patchCount = repo.cobs?.patches?.[status];
  $: showMoreButton =
    !loading &&
    !error &&
    (patchCount === undefined
      ? allPatches.length === (page + 1) * PATCHES_PER_PAGE
      : allPatches.length < patchCount);
</script>

<style>
  .header {
    display: flex;
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
        search: "status=open",
      }}>
      <Button variant={status === "open" ? "gray" : "background"}>
        <Icon name="patch" />
        <div class="title-counter" class:active={status === "open"}>
          Open
          {#if repo.cobs?.patches}
            <span class="counter" class:selected={status === "open"}>
              {repo.cobs.patches.open}
            </span>
          {/if}
        </div>
      </Button>
    </Link>
    <Link
      route={{
        resource: "repo.patches",
        repo: repoId,
        node: baseUrl,
        search: "status=draft",
      }}>
      <Button variant={status === "draft" ? "gray" : "background"}>
        <Icon name="patch-draft" />
        <div class="title-counter" class:active={status === "draft"}>
          Draft
          {#if repo.cobs?.patches}
            <span class="counter" class:selected={status === "draft"}>
              {repo.cobs.patches.draft}
            </span>
          {/if}
        </div>
      </Button>
    </Link>
    <Link
      route={{
        resource: "repo.patches",
        repo: repoId,
        node: baseUrl,
        search: "status=archived",
      }}>
      <Button variant={status === "archived" ? "gray" : "background"}>
        <Icon name="patch-archived" />
        <div class="title-counter" class:active={status === "archived"}>
          Archived
          {#if repo.cobs?.patches}
            <span class="counter" class:selected={status === "archived"}>
              {repo.cobs.patches.archived}
            </span>
          {/if}
        </div>
      </Button>
    </Link>
    <Link
      route={{
        resource: "repo.patches",
        repo: repoId,
        node: baseUrl,
        search: "status=merged",
      }}>
      <Button variant={status === "merged" ? "gray" : "background"}>
        <Icon name="patch-merged" />
        <div class="title-counter" class:active={status === "merged"}>
          Merged
          {#if repo.cobs?.patches}
            <span class="counter" class:selected={status === "merged"}>
              {repo.cobs.patches.merged}
            </span>
          {/if}
        </div>
      </Button>
    </Link>
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

  {#if repo.cobs?.patches?.[status] === 0}
    <div class="placeholder">
      <Placeholder iconName="no-patches" caption={`No ${status} patches`} />
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
