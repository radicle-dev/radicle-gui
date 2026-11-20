<script lang="ts">
  import type { PaginatedQuery } from "@bindings/cob/PaginatedQuery";
  import type { Commit } from "@bindings/repo/Commit";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { COMMITS_PAGE_SIZE } from "@app/views/repo/router";
  import fuzzysort from "fuzzysort";

  import { commitRowsOf, groupCommitsByDay } from "@app/lib/commitGroups";
  import { debounced } from "@app/lib/debounced.svelte";
  import { invoke } from "@app/lib/invoke";
  import { latestHead } from "@app/lib/latestHead.svelte";
  import { newerCommits } from "@app/lib/newerCommits";
  import { createPaginatedList } from "@app/lib/paginatedList.svelte";
  import * as router from "@app/lib/router";
  import type { SidebarData } from "@app/lib/router/definitions";
  import { modifierKey } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import CobCommitTeaser from "@app/components/CobCommitTeaser.svelte";
  import FuzzySearch from "@app/components/FuzzySearch.svelte";
  import Icon from "@app/components/Icon.svelte";
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

  // The commit the list pages from: the loaded one, then each newer one the
  // branch moves on to, whose commits are added at the top. A reload from a
  // newer head mounts the page anew, so the loaded props never change here.
  // svelte-ignore state_referenced_locally
  let listHead = $state(oid);
  // svelte-ignore state_referenced_locally
  let headCommit = $state(commit);

  const list = createPaginatedList<Commit>({
    key: () => listKey(),
    page: () => commits,
    fetchPage: (skip, take) =>
      invoke<PaginatedQuery<Commit[]>>("list_repo_commits", {
        rid: repo.rid,
        head: listHead,
        skip,
        take,
      }),
    pageSize: COMMITS_PAGE_SIZE,
    id: commit => commit.id,
    skipPersist: () => searchInput !== "",
  });

  const latest = latestHead(() => ({ rid: repo.rid, peer, revision, oid }));
  // A newer head that doesn't descend from the list's, such as after a force
  // push, can't be added at the top; the list offers to start over instead.
  let rewritten: string | undefined = $state();
  // A head whose commits couldn't be fetched, tried again once it moves on.
  let failed: string | undefined = $state();
  let catchingUp = $state(false);

  // Catches up with each head in turn, also one that moved on while the last
  // catch-up ran.
  $effect(() => {
    const newer = latest.current;
    if (
      newer === undefined ||
      catchingUp ||
      newer === listHead ||
      newer === rewritten ||
      newer === failed
    ) {
      return;
    }
    catchingUp = true;
    void addNewer(newer)
      .catch(error => {
        failed = newer;
        console.error("Adding newer commits failed", error);
      })
      .finally(() => {
        catchingUp = false;
      });
  });

  // How far back to look for the list's head before taking the history as
  // rewritten.
  const CATCH_UP_LIMIT = 1_000;
  const CATCH_UP_PAGE = 50;

  async function addNewer(newer: string): Promise<void> {
    const result = await newerCommits(
      (skip, take) =>
        invoke<PaginatedQuery<Commit[]>>("list_repo_commits", {
          rid: repo.rid,
          head: newer,
          skip,
          take,
        }),
      listHead,
      CATCH_UP_LIMIT,
      CATCH_UP_PAGE,
    );
    if (result.type === "rewritten") {
      rewritten = newer;
      return;
    }
    listHead = newer;
    headCommit = result.commits[0] ?? headCommit;
    rewritten = undefined;
    if (result.merge) {
      // A merge brings in commits older than the list's head, which belong
      // further down, so the shown rows are fetched again instead.
      await list.revalidate(list.items.length + result.commits.length);
    } else {
      list.prepend(result.commits);
    }
  }

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
      oid={listHead}
      commit={headCommit}
      {baseRoute}
      active="commits">
      {#snippet notice()}
        {#if rewritten !== undefined && rewritten === latest.current}
          <Button
            variant="outline"
            styleHeight="1.75rem"
            title="The branch's history was rewritten. Show the latest."
            onclick={() => void router.replace(baseRoute)}>
            <Icon name="refresh" />
            Newer commits
          </Button>
        {/if}
      {/snippet}
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
          keepRowsOnPrepend={searchInput === ""}
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
