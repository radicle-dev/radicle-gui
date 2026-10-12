<script lang="ts">
  import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";
  import type { Commit } from "@bindings/repo/Commit";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { COMMITS_PAGE_SIZE } from "@app/views/repo/router";
  import fuzzysort from "fuzzysort";

  import { commitRowsOf, groupCommitsByDay } from "@app/lib/commitGroups";
  import { debounced } from "@app/lib/debounced.svelte";
  import { invoke } from "@app/lib/invoke";
  import { createPaginatedList } from "@app/lib/paginatedList.svelte";
  import * as router from "@app/lib/router";
  import type { SidebarData } from "@app/lib/router/definitions";
  import { modifierKey } from "@app/lib/utils";

  import CobCommitTeaser from "@app/components/CobCommitTeaser.svelte";
  import FuzzySearch from "@app/components/FuzzySearch.svelte";
  import RepoHeader from "@app/components/RepoHeader.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import SourceHeader from "@app/components/SourceHeader.svelte";
  import VirtualList from "@app/components/VirtualList.svelte";

  import Layout from "./Layout.svelte";

  interface Props {
    repo: RepoInfo;
    peer?: string;
    revision?: string;
    oid: string;
    commit: Commit;
    commits: PaginatedQuery<Commit[]>;
    sidebarData: SidebarData;
  }

  const { repo, peer, revision, oid, commit, commits, sidebarData }: Props =
    $props();

  const baseRoute = $derived({
    resource: "repo.commits" as const,
    rid: repo.rid,
    peer,
    revision,
  });

  function listKey(): string {
    return `repo.commits:${repo.rid}:${peer ?? ""}:${revision ?? ""}`;
  }

  let loading = $state(false);
  let searchInput = $state("");
  const debouncedSearch = debounced(() => searchInput, 150);
  let showSearch = $state(false);

  const list = createPaginatedList<Commit>({
    key: () => listKey(),
    page: () => commits,
    fetchPage: (skip, take) =>
      invoke<PaginatedQuery<Commit[]>>("list_repo_commits", {
        rid: repo.rid,
        head: oid,
        skip,
        take,
      }),
    pageSize: COMMITS_PAGE_SIZE,
    id: commit => commit.id,
    skipPersist: () => searchInput !== "",
  });

  const searchableCommits = $derived(
    list.items.map(c => ({
      commit: c,
      id: c.id,
      summary: c.summary,
      author: c.author.name,
    })),
  );

  const searchResults = $derived(
    fuzzysort.go(debouncedSearch.current, searchableCommits, {
      keys: ["summary", "id", "author"],
      threshold: 0.5,
      all: true,
    }),
  );

  const filteredCommits = $derived(searchResults.map(r => r.obj.commit));

  const commitRows = $derived(commitRowsOf(groupCommitsByDay(filteredCommits)));
</script>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .group-title {
    color: var(--color-text-secondary);
    font: var(--txt-body-m-regular);
    padding: 1rem 1rem 0.75rem;
  }
  .commit-item {
    margin: 0 1rem;
    padding: 0.625rem 1rem;
    cursor: pointer;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-bottom: none;
  }
  .commit-item.first {
    border-top-left-radius: var(--border-radius-md);
    border-top-right-radius: var(--border-radius-md);
  }
  .commit-item.last {
    border-bottom: 1px solid var(--color-border-subtle);
    border-bottom-left-radius: var(--border-radius-md);
    border-bottom-right-radius: var(--border-radius-md);
  }
  .commit-item:hover {
    background: var(--color-surface-subtle);
  }
</style>

<Layout selfScroll>
  <div class="page">
    <RepoHeader {repo} config={sidebarData.config} />
    <SourceHeader
      {repo}
      {peer}
      {revision}
      {oid}
      {commit}
      {baseRoute}
      active="commits">
      {#snippet extra()}
        <FuzzySearch
          hasItems={list.items.length > 0}
          placeholder={`Search commits ${modifierKey()} + f`}
          styleHeight="1.75rem"
          icon={loading ? "clock" : "search"}
          onFocus={async () => {
            try {
              loading = true;
              await list.loadMore(true);
            } catch (e) {
              console.error("Loading all commits failed: ", e);
            } finally {
              loading = false;
            }
          }}
          onSubmit={() => {
            if (filteredCommits.length === 1) {
              void router.push({
                resource: "repo.commit",
                rid: repo.rid,
                commit: filteredCommits[0].id,
              });
            }
          }}
          bind:show={showSearch}
          bind:value={searchInput} />
      {/snippet}
    </SourceHeader>
    {#if filteredCommits.length === 0}
      <div
        class="global-flex"
        style:flex="1"
        style:justify-content="center"
        style:align-items="center">
        <div
          class="txt-missing txt-body-m-regular global-flex"
          style:gap="0.25rem">
          {#if list.items.length > 0}
            No matching commits
          {:else}
            No commits
          {/if}
        </div>
      </div>
    {:else}
      <ScrollArea style="flex: 1; min-height: 0;">
        <VirtualList
          items={commitRows}
          hasMore={list.more}
          loadingMore={list.loadingMore}
          onLoadMore={() => list.loadMore()}
          getKey={r =>
            r.type === "header" ? `h:${r.key}` : `c:${r.commit.id}`}
          initialCache={list.initialCache}
          initialScrollOffset={list.initialScrollOffset}
          onRestored={list.consumeRestoredScroll}
          onState={list.persistScroll}>
          {#snippet row(item)}
            {#if item.type === "header"}
              <div class="group-title">{item.label}</div>
            {:else}
              <div
                class="commit-item"
                class:first={item.first}
                class:last={item.last}
                role="button"
                tabindex="0"
                onclick={() => {
                  void router.push({
                    resource: "repo.commit",
                    rid: repo.rid,
                    commit: item.commit.id,
                  });
                }}
                onkeydown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void router.push({
                      resource: "repo.commit",
                      rid: repo.rid,
                      commit: item.commit.id,
                    });
                  }
                }}>
                <CobCommitTeaser
                  commit={item.commit}
                  disabled={false}
                  flush
                  hoverable />
              </div>
            {/if}
          {/snippet}
        </VirtualList>
      </ScrollArea>
    {/if}
  </div>
</Layout>
