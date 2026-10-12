<script lang="ts">
  import type { IssueStatus } from "@app/views/repo/router";
  import type { CacheEvent } from "@bindings/cob/CacheEvent";
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { DEFAULT_TAKE } from "@app/views/repo/router";
  import delay from "lodash/delay";

  import { searchCobs } from "@app/lib/cobSearch";
  import { debounced } from "@app/lib/debounced.svelte";
  import { channel, invoke } from "@app/lib/invoke";
  import {
    issueCountMismatch,
    resetIssueCounts,
    updateIssueCounts,
  } from "@app/lib/issueCounts.svelte";
  import { show } from "@app/lib/modal";
  import { createPaginatedList } from "@app/lib/paginatedList.svelte";
  import * as router from "@app/lib/router";
  import { modifierKey } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import CobCacheWarning from "@app/components/CobCacheWarning.svelte";
  import FuzzySearch from "@app/components/FuzzySearch.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IssueTeaser from "@app/components/IssueTeaser.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import Topbar from "@app/components/Topbar.svelte";
  import VirtualList from "@app/components/VirtualList.svelte";
  import CreateIssueModal from "@app/modals/CreateIssue.svelte";

  import Layout from "./Layout.svelte";

  interface Props {
    repo: RepoInfo;
    issues: PaginatedQuery<Issue[]>;
    status: IssueStatus;
  }

  const { repo, issues, status }: Props = $props();

  function listKey(filter: IssueStatus): string {
    return `repo.issues:${repo.rid}:${filter}`;
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

  const list = createPaginatedList<Issue>({
    key: () => listKey(status),
    page: () => issues,
    fetchPage: (skip, take) =>
      invoke<PaginatedQuery<Issue[]>>("list_issues", {
        rid: repo.rid,
        status,
        skip,
        take,
      }),
    pageSize: DEFAULT_TAKE,
    id: issue => issue.id,
    skipPersist: () => searchInput !== "",
  });

  $effect(() => {
    // Only record counts from settled, fresh data: while a history-restore
    // revalidation is in flight (loadingMore), the snapshot's length/more are
    // stale and would flag a cache mismatch that isn't there.
    if (list.more === false && !list.loadingMore) {
      updateIssueCounts(
        list.items.length,
        {
          ...project.meta.issues,
          all: project.meta.issues.open + project.meta.issues.closed,
        },
        status,
      );
    }
  });

  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    status;

    searchInput = "";
    showSearch = false;
  });

  async function rebuildIssueCache() {
    try {
      await invoke("rebuild_issue_cache", {
        rid: repo.rid,
        onEvent: channel<CacheEvent>(message => {
          cacheState = message;
        }),
      });
    } catch (error) {
      console.error(error);
    } finally {
      await list.revalidate();
      resetIssueCounts();

      delay(() => {
        cacheState = undefined;
      }, 1500);
    }
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
  .row {
    border-bottom: 1px solid var(--color-border-subtle);
  }
</style>

<Layout selfScroll>
  <div class="page">
    <Topbar>
      <span class="topbar-title">Issues</span>
      <div class="filters">
        <a
          class="filter"
          class:active={status === "all"}
          href={router.routeToPath({
            resource: "repo.issues",
            rid: repo.rid,
            status: "all",
          })}>
          <Icon name="issue" />All
          <span class="global-counter-badge">
            {project.meta.issues.open + project.meta.issues.closed}
          </span>
        </a>
        <a
          class="filter"
          class:active={status === "open"}
          href={router.routeToPath({
            resource: "repo.issues",
            rid: repo.rid,
            status: "open",
          })}>
          <Icon name="issue" />Open
          <span class="global-counter-badge">{project.meta.issues.open}</span>
        </a>
        <a
          class="filter"
          class:active={status === "closed"}
          href={router.routeToPath({
            resource: "repo.issues",
            rid: repo.rid,
            status: "closed",
          })}>
          <Icon name="issue-closed" />Closed
          <span class="global-counter-badge">{project.meta.issues.closed}</span>
        </a>
      </div>
      <div class="global-flex" style:margin-left="auto" style:gap="0.5rem">
        <FuzzySearch
          hasItems={list.items.length > 0}
          placeholder={`Search issues ${modifierKey()} + f`}
          icon={loading ? "clock" : "search"}
          onFocus={async () => {
            try {
              loading = true;
              await list.loadMore(true);
            } catch (e) {
              console.error("Loading all issues failed: ", e);
            } finally {
              loading = false;
            }
          }}
          onSubmit={async () => {
            if (searchResults.length === 1) {
              await router.push({
                resource: "repo.issue",
                rid: repo.rid,
                issue: searchResults[0].id,
                status,
              });
            }
          }}
          bind:show={showSearch}
          bind:value={searchInput} />
        <Button
          styleHeight="2rem"
          variant="secondary"
          onclick={() =>
            show({
              component: CreateIssueModal,
              props: { repo },
            })}>
          <Icon name="plus" />New issue
        </Button>
      </div>
    </Topbar>

    {#if searchResults.length === 0}
      {#if issueCountMismatch(status)}
        <CobCacheWarning
          noun="issues"
          {cacheState}
          onRebuild={rebuildIssueCache} />
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
            No matching issues
          {:else}
            No {status === "all" ? "" : status} issues
          {/if}
        </div>
      </div>
    {:else}
      <ScrollArea style="height: 100%; min-width: 0;">
        <div bind:clientHeight={chromeHeight}>
          {#if issueCountMismatch(status)}
            <CobCacheWarning
              noun="issues"
              {cacheState}
              onRebuild={rebuildIssueCache} />
          {/if}
        </div>
        <VirtualList
          items={searchResults}
          hasMore={list.more}
          loadingMore={list.loadingMore}
          onLoadMore={() => list.loadMore()}
          startMargin={chromeHeight}
          estimatedItemSize={80}
          getKey={issue => issue.id}
          initialCache={list.initialCache}
          initialScrollOffset={list.initialScrollOffset}
          onRestored={list.consumeRestoredScroll}
          onState={list.persistScroll}>
          {#snippet row(issue)}
            <div class="row">
              <IssueTeaser
                focussed={searchResults.length === 1 && searchInput !== ""}
                {issue}
                rid={repo.rid}
                {status} />
            </div>
          {/snippet}
        </VirtualList>
      </ScrollArea>
    {/if}
  </div>
</Layout>
