<script lang="ts">
  import type { NotificationItem } from "@bindings/cob/inbox/NotificationItem";
  import type { NotificationsByRepo } from "@bindings/cob/inbox/NotificationsByRepo";

  import { array, string, z } from "zod";

  import {
    type FilteredRepo,
    filterNotifications,
    rowIdsOf,
  } from "@app/lib/inboxFilter";
  import {
    type DateGroup,
    dateGroupOf,
    involvesMe,
    latestTimestampOf,
  } from "@app/lib/inboxSummary";
  import { togglePinned } from "@app/lib/repoOrdering";
  import useLocalStorage from "@app/lib/useLocalStorage.svelte";
  import { modifierKey, preserveFocus } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import ConfirmClear from "@app/components/ConfirmClear.svelte";
  import FuzzySearch from "@app/components/FuzzySearch.svelte";
  import Icon from "@app/components/Icon.svelte";
  import NotificationsByRepoComponent from "@app/components/NotificationsByRepo.svelte";
  import NotificationTeaser from "@app/components/NotificationTeaser.svelte";
  import { sidebarPinOrder } from "@app/components/SidebarRepoList.svelte";

  interface Props {
    clearAll: () => Promise<void>;
    clearByIds: (ids: string[]) => Promise<void>;
    clearByRepo: (rid: string) => Promise<void>;
    loadMore: (rid: string, take: number) => Promise<void>;
    loadNew: () => Promise<void>;
    newRowIds: string[];
    notificationCount: number | undefined;
    notificationsByRepo: NotificationsByRepo[];
  }

  const {
    clearAll,
    clearByIds,
    clearByRepo,
    loadMore,
    loadNew,
    newRowIds,
    notificationCount,
    notificationsByRepo,
  }: Props = $props();

  let searchInput = $state("");
  let showSearch = $state(false);
  let excludedGroupIds = $state<string[]>([]);
  let onlyMine = $state(false);

  const newRowIdSet = $derived(new Set(newRowIds));

  function isNew(group: NotificationItem[]) {
    return group.some(item => newRowIdSet.has(item.rowId));
  }

  const isFiltering = $derived(searchInput.trim() !== "");

  // Anything that hides notifications from view, so bulk deletes stay scoped
  // to what is actually on screen.
  const isNarrowed = $derived(isFiltering || onlyMine);

  const relevantRepos = $derived.by(() => {
    if (!onlyMine) {
      return notificationsByRepo;
    }
    return notificationsByRepo
      .map(repo => {
        const notifications = repo.notifications.filter(involvesMe);
        return { ...repo, notifications, count: notifications.length };
      })
      .filter(repo => repo.notifications.length > 0);
  });

  function excludeGroup(id: string) {
    if (!excludedGroupIds.includes(id)) {
      excludedGroupIds = [...excludedGroupIds, id];
    }
  }

  function resetExclusions() {
    excludedGroupIds = [];
  }

  const searchableRepos = $derived(
    isFiltering
      ? relevantRepos.filter(r => !hiddenRepos.value.includes(r.rid))
      : relevantRepos,
  );

  const filteredRepos = $derived(
    filterNotifications(searchableRepos, searchInput, excludedGroupIds),
  );

  const matchedTotal = $derived(
    filteredRepos.reduce((acc, r) => acc + r.count, 0),
  );

  const matchedRowIdsByRepo = $derived(
    new Map(filteredRepos.map(r => [r.repo.rid, rowIdsOf(r.groups)])),
  );

  const allMatchedRowIds = $derived([...matchedRowIdsByRepo.values()].flat());

  async function effectiveClearAll() {
    if (isNarrowed) {
      await clearByIds(allMatchedRowIds);
      searchInput = "";
      showSearch = false;
      excludedGroupIds = [];
    } else {
      await clearAll();
    }
  }

  function effectiveClearByRepo(rid: string) {
    return isNarrowed
      ? clearByIds(matchedRowIdsByRepo.get(rid) ?? [])
      : clearByRepo(rid);
  }

  const sortOptions = [
    {
      value: "sidebar" as const,
      label: "Repo",
      icon: "repository" as const,
      title: "Group notifications by repository, ordered like the sidebar",
    },
    {
      value: "latest" as const,
      label: "Latest",
      icon: "clock" as const,
      title: "One list of every notification, newest first",
    },
  ];

  const sortMode = useLocalStorage(
    "inboxRepoSort",
    z.enum(["sidebar", "latest"]),
    "sidebar",
    !window.localStorage,
  );

  const hiddenRepos = useLocalStorage(
    "hiddenInboxRepos",
    array(string()),
    [],
    !window.localStorage,
  );

  function toggleHide(rid: string) {
    hiddenRepos.value = togglePinned(hiddenRepos.value, rid);
  }

  const latestByRepo = $derived(
    new Map(
      filteredRepos.map(
        r => [r.repo.rid, latestTimestampOf(r.groups)] as const,
      ),
    ),
  );

  const displayRepos = $derived(sortedRepos(filteredRepos, hiddenRepos.value));

  // Repos the sidebar pins come first there, in the order they were dragged
  // into; everything else is alphabetical.
  function bySidebarOrder(a: FilteredRepo, b: FilteredRepo) {
    const order = sidebarPinOrder();
    const rankA = order.indexOf(a.repo.rid);
    const rankB = order.indexOf(b.repo.rid);
    if (rankA !== rankB) {
      return (
        (rankA === -1 ? order.length : rankA) -
        (rankB === -1 ? order.length : rankB)
      );
    }
    return a.repo.name.localeCompare(b.repo.name);
  }

  function byLatest(a: FilteredRepo, b: FilteredRepo) {
    return (
      (latestByRepo.get(b.repo.rid) ?? 0) - (latestByRepo.get(a.repo.rid) ?? 0)
    );
  }

  function sortedRepos(allRepos: FilteredRepo[], hidden: string[]) {
    const compare = sortMode.value === "latest" ? byLatest : bySidebarOrder;
    const visibleRepos = allRepos
      .filter(r => !hidden.includes(r.repo.rid))
      .sort(compare);
    const hiddenRepos = allRepos
      .filter(r => hidden.includes(r.repo.rid))
      .sort(compare);

    return [...visibleRepos, ...hiddenRepos];
  }

  const flatNotifications = $derived.by(() =>
    displayRepos
      .filter(r => !hiddenRepos.value.includes(r.repo.rid))
      .flatMap(r =>
        r.groups.map(group => ({
          rid: r.repo.rid,
          repoName: r.repo.name,
          group,
          latest: latestTimestampOf([group]),
        })),
      )
      .sort((a, b) => b.latest - a.latest),
  );

  // The flat list is already newest-first, so consecutive runs share a headline.
  const dateGroups = $derived.by(() => {
    const groups: (DateGroup & { items: typeof flatNotifications })[] = [];

    for (const notification of flatNotifications) {
      const group = dateGroupOf(notification.latest);
      const current = groups.at(-1);
      if (current && current.key === group.key) {
        current.items.push(notification);
      } else {
        groups.push({ ...group, items: [notification] });
      }
    }

    return groups;
  });

  function loadedNotificationCount() {
    return notificationsByRepo.reduce((acc, repo) => {
      return acc + repo.count;
    }, 0);
  }
</script>

<style>
  .container {
    width: 100%;
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }
  .header {
    font: var(--txt-heading-m);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  /* Sorting, the relevance filter and search all sit together on the right. */
  .header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-left: auto;
    color: var(--color-text-tertiary);
  }
  .clear-inbox {
    display: flex;
    color: var(--color-text-tertiary);
  }
  .new-dot {
    width: 0.5rem;
    height: 0.5rem;
    flex-shrink: 0;
    border-radius: var(--border-radius-full);
    background-color: var(--color-surface-brand-primary);
  }
  .sort {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
    box-sizing: border-box;
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-sm);
  }
  .checkbox.checked {
    background-color: var(--color-surface-brand-primary);
    border-color: var(--color-surface-brand-primary);
    color: var(--color-text-on-brand);
  }
  .sort-switch {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .filter-search {
    display: flex;
  }
  .filter-search.expanded {
    width: 16rem;
  }
  .repo-list {
    display: flex;
    flex-direction: column;
    margin-top: 1rem;
    padding-bottom: 1rem;
  }
  .section {
    padding: 1rem;
    margin: 0 -1rem;
  }
  .section:first-child {
    padding-top: 0;
  }
  .section + .section {
    border-top: 1px solid var(--color-border-subtle);
  }
  .flat-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: 1rem;
  }
  .date-groups {
    display: flex;
    flex-direction: column;
    margin-top: 1rem;
    padding-bottom: 1rem;
  }
  .date-headline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
  }
  .clear-date-group {
    display: none;
    color: var(--color-text-tertiary);
  }
  .date-headline:hover .clear-date-group {
    display: flex;
  }
  .no-matches {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>

<div class="container">
  {#if notificationCount !== undefined && notificationCount > 0}
    <div class="header">
      <div class="header-left">
        <div class="global-flex">
          Inbox
          <span class="global-counter-badge">
            {isNarrowed ? matchedTotal : notificationCount}
          </span>
        </div>
        <div class="clear-inbox" use:preserveFocus>
          {#key isNarrowed}
            <ConfirmClear
              count={isNarrowed ? matchedTotal : notificationCount}
              matching={isNarrowed}
              triggerLabel={isNarrowed ? "Delete shown" : "Delete all"}
              clear={effectiveClearAll} />
          {/key}
        </div>
        {#if !isFiltering && notificationCount > loadedNotificationCount()}
          <div class="txt-missing txt-body-m-regular global-flex">
            <Button variant="naked" onclick={loadNew}>
              <span class="new-dot"></span>
              See {notificationCount - loadedNotificationCount()} new
            </Button>
          </div>
        {/if}
        {#if isFiltering && excludedGroupIds.length > 0}
          <div class="txt-missing txt-body-m-regular global-flex">
            <Button variant="naked" onclick={resetExclusions}>
              Reset {excludedGroupIds.length} excluded
            </Button>
          </div>
        {/if}
      </div>
      <div class="header-right">
        <div class="sort">
          <span class="txt-body-m-regular">Sort</span>
          <div class="sort-switch">
            {#each sortOptions as option}
              <Button
                variant="naked"
                active={sortMode.value === option.value}
                title={option.title}
                onclick={() => (sortMode.value = option.value)}>
                <Icon name={option.icon} />
                {option.label}
              </Button>
            {/each}
          </div>
        </div>
        <Button
          variant="naked"
          title="Show only issues and patches you opened, are assigned to, or have taken part in"
          onclick={() => (onlyMine = !onlyMine)}>
          <span class="checkbox" class:checked={onlyMine}>
            {#if onlyMine}
              <Icon name="checkmark" />
            {/if}
          </span>
          Involves me
        </Button>

        <div class="filter-search" class:expanded={showSearch}>
          <FuzzySearch
            icon="search"
            placeholder={`Search notifications ${modifierKey()} + f`}
            bind:show={showSearch}
            bind:value={searchInput} />
        </div>
      </div>
    </div>
  {/if}

  {#if notificationCount !== undefined && notificationCount > 0 && isNarrowed && filteredRepos.length === 0}
    <div class="no-matches">
      <div
        class="txt-missing txt-body-m-regular global-flex"
        style:gap="0.25rem">
        {#if isFiltering}
          Search didn't match anything
        {:else}
          Nothing here involves you
        {/if}
      </div>
    </div>
  {:else if notificationCount !== undefined && notificationCount > 0 && sortMode.value === "latest"}
    <div class="date-groups">
      {#each dateGroups as dateGroup (dateGroup.key)}
        <div class="section">
          <div class="date-headline">
            <span class="txt-body-l-semibold">{dateGroup.label}</span>
            <span class="global-counter-badge">{dateGroup.items.length}</span>
            <div class="clear-date-group" use:preserveFocus>
              <ConfirmClear
                count={dateGroup.items.length}
                icon="trash"
                subject={`from ${dateGroup.subject}`}
                clear={() => {
                  void clearByIds(rowIdsOf(dateGroup.items.map(n => n.group)));
                }} />
            </div>
          </div>
          <div class="flat-list">
            {#each dateGroup.items as n (`${n.rid}:${n.group[0].id}`)}
              <NotificationTeaser
                {clearByIds}
                rid={n.rid}
                kind={n.group[0].type}
                oid={n.group[0].id}
                notificationItems={n.group}
                pulse={isNew(n.group)}
                onExclude={isFiltering
                  ? () => excludeGroup(n.group[0].id)
                  : undefined} />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else if notificationCount !== undefined && notificationCount > 0}
    <div class="repo-list">
      {#each displayRepos as r (r.repo.rid)}
        <div class="section">
          <NotificationsByRepoComponent
            count={r.count}
            excludeGroup={isFiltering ? excludeGroup : undefined}
            {isFiltering}
            groupedNotifications={r.groups}
            hidden={hiddenRepos.value.includes(r.repo.rid)}
            name={r.repo.name}
            rid={r.repo.rid}
            {clearByIds}
            clearByRepo={effectiveClearByRepo}
            {loadMore}
            {newRowIds}
            {toggleHide} />
        </div>
      {/each}
    </div>
  {/if}
</div>
