<script lang="ts">
  import type { ActivityItem } from "@bindings/contribution/ActivityItem";
  import type { ContributionDay } from "@bindings/contribution/ContributionDay";
  import type { User } from "@bindings/user/User";
  import type { ComponentProps } from "svelte";

  import type { WeeklyActivity } from "@app/lib/activity";
  import { loadRepoActivity } from "@app/lib/activity";
  import { cachedRepoCommitCount, invoke } from "@app/lib/invoke";
  import { routeToPath } from "@app/lib/router";
  import type { SidebarData, UserRepo } from "@app/lib/router/definitions";
  import { USER_ACTIVITY_TAKE } from "@app/lib/router/definitions";
  import {
    absoluteTimestamp,
    formatRepositoryId,
    formatTimestamp,
    issueStatusColor,
    patchStatusColor,
    pluralize,
    publicKeyFromDid,
    truncateDid,
    truncateId,
  } from "@app/lib/utils";

  import ActivityDiagram from "@app/components/ActivityDiagram.svelte";
  import Button from "@app/components/Button.svelte";
  import Command from "@app/components/Command.svelte";
  import ContributionCalendar from "@app/components/ContributionCalendar.svelte";
  import CopyableId from "@app/components/CopyableId.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import ShareButton from "@app/components/ShareButton.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";
  import Layout from "@app/views/repo/Layout.svelte";

  type IconName = ComponentProps<typeof Icon>["name"];

  interface Props {
    sidebarData: SidebarData;
    user: User;
    repos: UserRepo[];
    activity: ActivityItem[];
    calendar: ContributionDay[];
  }

  const { sidebarData, user, repos, activity, calendar }: Props = $props();

  const config = $derived(sidebarData.config);
  const publicKey = $derived(publicKeyFromDid(user.did));
  const name = $derived(user.alias ?? truncateId(publicKey));

  // The repo list is collapsed by default so the activity feed below it is on
  // screen without scrolling past a long list.
  const REPOS_COLLAPSED = 3;

  let followExpanded = $state(false);
  let reposExpanded = $state(false);

  // "Show more" refetches a longer window in place rather than re-running the
  // route load. Tagging the override with the DID it belongs to means
  // navigating to another profile falls back to that route's own feed without
  // an effect to reset it.
  let expanded = $state<
    { did: string; items: ActivityItem[]; limit: number } | undefined
  >(undefined);
  let loadingMore = $state(false);

  const override = $derived(expanded?.did === user.did ? expanded : undefined);
  const feed = $derived(override?.items ?? activity);
  const feedLimit = $derived(override?.limit ?? USER_ACTIVITY_TAKE);
  // A short page means the query had nothing left to give.
  const feedExhausted = $derived(feed.length < feedLimit);

  async function loadMore() {
    if (loadingMore || feedExhausted) return;
    loadingMore = true;
    const limit = feedLimit + USER_ACTIVITY_TAKE;
    try {
      const items = await invoke<ActivityItem[]>("user_activity", {
        did: user.did,
        limit,
      });
      expanded = { did: user.did, items, limit };
    } finally {
      loadingMore = false;
    }
  }

  // Reaching the end of the feed pages it forward. Observed against the
  // document viewport rather than the enclosing ScrollArea: its viewport
  // element is only exposed to its own children, and ancestor overflow is
  // already factored into the intersection either way.
  let feedSentinel = $state<HTMLElement>();
  $effect(() => {
    const el = feedSentinel;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  });

  // Repo names for the feed. Activity can in principle name a repo the COB
  // cache still knows but storage no longer lists, so the RID is the fallback.
  const repoNames = $derived.by(() => {
    const names: Record<string, string> = {};
    for (const summary of sidebarData.repos) {
      names[summary.rid] = summary.name;
    }
    for (const entry of repos) {
      const project = entry.repo.payloads["xyz.radicle.project"];
      if (project) names[entry.repo.rid] = project.data.name;
    }
    return names;
  });

  interface RepoRow {
    rid: string;
    name: string;
    description: string;
    isDelegate: boolean;
    patchesAuthored: number;
    issuesAuthored: number;
    lastContribution: number | undefined;
    lastCommit: number;
    activity: Promise<WeeklyActivity[]>;
    commitCount: Promise<number> | undefined;
  }

  const rows = $derived.by((): RepoRow[] =>
    repos.map(
      ({
        repo,
        isDelegate,
        patchesAuthored,
        issuesAuthored,
        lastContribution,
      }) => {
        const project = repo.payloads["xyz.radicle.project"];
        const head = project?.meta.head;
        return {
          rid: repo.rid,
          name: project?.data.name ?? repo.rid,
          description: project?.data.description ?? "",
          isDelegate,
          patchesAuthored,
          issuesAuthored,
          lastContribution,
          lastCommit: repo.lastCommitTimestamp,
          activity: head
            ? loadRepoActivity(repo.rid, head)
            : Promise.resolve([] as WeeklyActivity[]),
          commitCount: head ? cachedRepoCommitCount(repo.rid, head) : undefined,
        };
      },
    ),
  );

  // Ordered by when this person last touched each repo. It is their profile,
  // so recency of their own contribution is the only ordering that reads
  // meaningfully here — a repo's own commit recency says nothing about them.
  // A delegated repo they never contributed to has no such date, so it sorts
  // last, alphabetically among its peers.
  const orderedRows = $derived.by(() =>
    [...rows].sort((a, b) => {
      if (
        a.lastContribution === undefined &&
        b.lastContribution === undefined
      ) {
        return a.name.localeCompare(b.name);
      }
      if (a.lastContribution === undefined) return 1;
      if (b.lastContribution === undefined) return -1;
      return b.lastContribution - a.lastContribution;
    }),
  );

  interface FeedRun {
    key: string;
    rid: string;
    name: string;
    items: ActivityItem[];
  }

  // The feed stays in time order; neighbouring items from the same repo
  // collapse under one heading. Every run is headed, a run of one included, so
  // the repo is always named the same way.
  const feedRuns = $derived.by((): FeedRun[] => {
    const runs: FeedRun[] = [];
    for (const item of feed) {
      const last = runs.at(-1);
      if (last?.rid === item.rid) {
        last.items.push(item);
      } else {
        runs.push({
          key: `${item.rid}:${item.revisionId ?? item.id}`,
          rid: item.rid,
          name: repoNames[item.rid] ?? formatRepositoryId(item.rid),
          items: [item],
        });
      }
    }
    return runs;
  });

  const visibleRows = $derived(
    reposExpanded ? orderedRows : orderedRows.slice(0, REPOS_COLLAPSED),
  );
  const hiddenRepoCount = $derived(
    Math.max(0, orderedRows.length - REPOS_COLLAPSED),
  );

  function itemPath(item: ActivityItem): string {
    return item.kind === "issue"
      ? routeToPath({
          resource: "repo.issue",
          rid: item.rid,
          issue: item.id,
          status: "all",
        })
      : routeToPath({
          resource: "repo.patch",
          rid: item.rid,
          patch: item.id,
          status: undefined,
          reviewId: undefined,
        });
  }

  // Status-bearing icons, matching how the issue and patch timelines on a COB
  // page render their own state.
  function itemIcon(item: ActivityItem): IconName {
    if (item.kind === "revision") {
      return "revision";
    }
    if (item.kind === "issue") {
      return item.status === "closed" ? "issue-closed" : "issue";
    }
    switch (item.status) {
      case "merged":
        return "patch-merged";
      case "archived":
        return "patch-archived";
      case "draft":
        return "patch-draft";
      default:
        return "patch";
    }
  }

  function statusColor(item: ActivityItem): string {
    const map: Record<string, string> =
      item.kind === "issue" ? issueStatusColor : patchStatusColor;
    return map[item.status] ?? "var(--color-text-secondary)";
  }

  function itemLabel(item: ActivityItem): string {
    switch (item.kind) {
      case "revision":
        return `New revision on "${item.title}"`;
      case "issue":
        return `Issue "${item.title}"`;
      default:
        return `Patch "${item.title}"`;
    }
  }
</script>

<style>
  .page {
    display: grid;
    grid-template-columns: 18rem 1fr;
    grid-template-rows: 100%;
    height: 100%;
    min-height: 0;
  }
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border-right: 1px solid var(--color-border-subtle);
  }
  .banner {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    flex-shrink: 0;
  }
  .banner :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .alias {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
    min-width: 0;
  }
  .details {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .detail-label {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    width: fit-content;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
    white-space: nowrap;
  }
  .follow-hint {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 18rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .share {
    display: flex;
  }

  .calendar-block {
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .repo-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    min-height: 2.5rem;
    padding: 0.375rem 1rem;
    border: none;
    border-bottom: 1px solid var(--color-border-subtle);
    background: none;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .repo-toggle:hover {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 3rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    color: var(--color-text-primary);
  }
  .repo {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    text-decoration: none;
    color: inherit;
  }
  .repo:hover {
    background-color: var(--color-surface-subtle);
  }
  .repo-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .repo-avatar {
    width: 1.25rem;
    height: 1.25rem;
    overflow: hidden;
    flex-shrink: 0;
    border-radius: var(--border-radius-sm);
  }
  .repo-avatar :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .repo-name {
    font: var(--txt-body-l-semibold);
    color: var(--color-text-primary);
    min-width: 0;
  }
  .role {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: auto;
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-s-medium);
    flex-shrink: 0;
  }
  .role.delegate {
    background-color: var(--color-surface-brand-subtle);
    color: var(--color-text-brand);
  }
  .role.contributor {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .repo-body {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
  }
  .repo-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .repo-description {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .repo-rid {
    font: var(--txt-code-regular);
    color: var(--color-text-tertiary);
  }
  .sparkline {
    width: 15rem;
    max-width: 40%;
    flex-shrink: 0;
    color: var(--color-text-brand);
  }
  .sparkline-placeholder {
    height: 1.75rem;
  }
  .repo-stats {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-code-regular);
    color: var(--color-text-tertiary);
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .updated {
    margin-left: auto;
    font: var(--txt-body-m-regular);
    white-space: nowrap;
  }
  /* Same timeline construction as the patch page's discussion: a single
     absolutely positioned hairline behind the icon column, with each icon
     carrying the surrounding background so the line reads as broken by it.
     Rows are left static on purpose — an absolutely positioned ::before paints
     after in-flow children, so the rail stays visible across a hovered row
     instead of being covered by its background. */
  .feed-group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem 0.25rem;
    font: var(--txt-body-m-semibold);
    color: var(--color-text-secondary);
    text-decoration: none;
    min-width: 0;
  }
  .feed-group-header:hover {
    color: var(--color-text-primary);
  }
  .feed-group-avatar {
    display: flex;
    width: 1rem;
    height: 1rem;
    overflow: hidden;
    flex-shrink: 0;
    border-radius: var(--border-radius-sm);
  }
  .feed-group-avatar :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .feed {
    position: relative;
  }
  .feed.railed {
    padding: 0.25rem 0 0.5rem;
  }
  .feed.railed::before {
    content: "";
    position: absolute;
    top: 1.5rem;
    bottom: 1.75rem;
    left: 1.5rem;
    width: 1px;
    background-color: var(--color-border-subtle);
    pointer-events: none;
  }
  .feed-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 1rem;
    min-height: 2.5rem;
    text-decoration: none;
    color: inherit;
  }
  .feed-item:hover {
    background-color: var(--color-surface-subtle);
  }
  .feed-icon {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0.25rem 0;
    background-color: var(--color-surface-canvas);
  }
  .feed-item:hover .feed-icon {
    background-color: var(--color-surface-subtle);
  }
  .feed-title {
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    min-width: 0;
    flex-shrink: 1;
  }
  .feed-item:hover .feed-title {
    text-decoration: underline;
  }
  .feed-revision {
    flex-shrink: 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .feed-meta {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    margin-left: auto;
    flex-shrink: 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
  .feed-sentinel {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 3rem;
    padding: 0 1rem;
  }
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4rem 1rem;
    text-align: center;
  }
</style>

<Layout selfScroll>
  <div class="page">
    <div class="panel">
      <ScrollArea style="height: 100%; width: 100%;">
        <div class="banner">
          <UserAvatar nodeId={publicKey} styleWidth="100%" />
        </div>
        <div class="panel-body">
          <div class="panel-head">
            <div class="alias txt-overflow txt-selectable">{name}</div>
            {#if !user.isLocal}
              <Popover placement="bottom-end" bind:expanded={followExpanded}>
                {#snippet toggle(onclick)}
                  <Button
                    variant="outline"
                    active={followExpanded}
                    title={user.following
                      ? `You follow ${name}`
                      : `Follow ${name}`}
                    {onclick}>
                    <Icon name={user.following ? "checkmark" : "plus"} />
                    {user.following ? "Following" : "Follow"}
                  </Button>
                {/snippet}
                {#snippet popover()}
                  <div class="follow-hint">
                    {#if user.following}
                      <span>
                        You already follow this user, so their contributions are
                        fetched onto your device. To stop, use the Radicle CLI:
                      </span>
                      <Command
                        styleWidth="100%"
                        command={`rad unfollow ${publicKey}`} />
                    {:else}
                      <span>
                        Following a user ensures that their contributions are
                        fetched onto your device. Use the Radicle CLI to start
                        following:
                      </span>
                      <Command
                        styleWidth="100%"
                        command={`rad follow ${publicKey}`} />
                    {/if}
                  </div>
                {/snippet}
              </Popover>
            {/if}
          </div>

          <div class="details">
            <div class="detail">
              <span class="detail-label">
                <Icon name="key" />
                {user.alias ?? "user"}
              </span>
              <CopyableId id={user.did}>{truncateDid(user.did)}</CopyableId>
            </div>
            <div class="detail">
              <span class="detail-label"><Icon name="key" />SSH Key</span>
              <CopyableId id={user.ssh.full}>
                {user.ssh.full.slice(0, 10)}…{user.ssh.full.slice(-10)}
              </CopyableId>
            </div>
            <div class="detail">
              <span class="detail-label"><Icon name="key" />SSH Hash</span>
              <CopyableId id={user.ssh.hash}>
                {user.ssh.hash.slice(0, 10)}…{user.ssh.hash.slice(-10)}
              </CopyableId>
            </div>
          </div>

          <div class="share">
            <ShareButton
              target={{ type: "node", nid: user.publicKey }}
              id={user.did}
              idLabel="DID"
              copyIdLabel="Copy DID"
              {config} />
          </div>
        </div>
      </ScrollArea>
    </div>

    <ScrollArea style="height: 100%; width: 100%; min-width: 0;">
      {#if orderedRows.length === 0}
        <div class="empty">
          <span class="txt-missing txt-body-m-regular">
            Nothing from this user in your local storage. Repositories they
            delegate or contribute to only show up once you seed them.
          </span>
        </div>
      {:else}
        <div class="section-header">
          <span class="txt-body-l-semibold">Repositories</span>
          <span class="global-counter-badge">{rows.length}</span>
        </div>
        {#each visibleRows as row (row.rid)}
          <a
            class="repo"
            href={routeToPath({ resource: "repo.home", rid: row.rid })}>
            <div class="repo-head">
              <div class="repo-avatar">
                <RepoAvatar
                  name={row.name}
                  rid={row.rid}
                  styleWidth="1.25rem" />
              </div>
              <span class="repo-name txt-overflow">{row.name}</span>
              {#if row.isDelegate}
                <span
                  class="role delegate"
                  title={`${name} is a delegate of this repository`}>
                  <Icon name="badge" />
                  Delegate
                </span>
              {:else}
                <span
                  class="role contributor"
                  title={`${name} has opened patches or issues here`}>
                  Contributor
                </span>
              {/if}
            </div>
            <div class="repo-body">
              <div class="repo-text">
                {#if row.description}
                  <div class="repo-description txt-overflow">
                    {row.description}
                  </div>
                {/if}
                <div class="repo-rid txt-overflow">
                  {formatRepositoryId(row.rid)}
                </div>
              </div>
              <div class="sparkline">
                {#await row.activity}
                  <div class="sparkline-placeholder"></div>
                {:then weeks}
                  <ActivityDiagram id={row.rid} activity={weeks} />
                {:catch}
                  <div class="sparkline-placeholder"></div>
                {/await}
              </div>
            </div>
            <div class="repo-stats">
              <span
                class="stat"
                title={`${row.patchesAuthored} ${pluralize("patch", row.patchesAuthored)} opened by ${name}`}>
                <Icon name="patch" />
                {row.patchesAuthored}
              </span>
              <span>·</span>
              <span
                class="stat"
                title={`${row.issuesAuthored} ${pluralize("issue", row.issuesAuthored)} opened by ${name}`}>
                <Icon name="issue" />
                {row.issuesAuthored}
              </span>
              {#if row.commitCount}
                {#await row.commitCount then count}
                  <span>·</span>
                  <span class="stat" title="Commits on the default branch">
                    <Icon name="commit" />
                    {count}
                  </span>
                {/await}
              {/if}
              <span class="updated" title={absoluteTimestamp(row.lastCommit)}>
                Updated {formatTimestamp(row.lastCommit)} ago
              </span>
            </div>
          </a>
        {/each}
        {#if hiddenRepoCount > 0}
          <button
            class="repo-toggle"
            onclick={() => (reposExpanded = !reposExpanded)}>
            <Icon
              name={reposExpanded ? "collapse-vertical" : "expand-vertical"} />
            {reposExpanded
              ? "Show fewer repositories"
              : `Show ${hiddenRepoCount} more ${pluralize("repository", hiddenRepoCount)}`}
          </button>
        {/if}

        {#if feed.length > 0}
          <div class="section-header">
            <span class="txt-body-l-semibold">Recent activity</span>
          </div>
          <div class="calendar-block">
            <ContributionCalendar days={calendar} />
          </div>
          {#each feedRuns as run (run.key)}
            {@const grouped = run.items.length > 1}
            <a
              class="feed-group-header"
              href={routeToPath({ resource: "repo.home", rid: run.rid })}>
              <span class="feed-group-avatar">
                <RepoAvatar name={run.name} rid={run.rid} styleWidth="1rem" />
              </span>
              <span class="txt-overflow">{run.name}</span>
            </a>
            <div class="feed" class:railed={grouped}>
              {#each run.items as item (item.revisionId ?? item.id)}
                <a
                  class="feed-item"
                  href={itemPath(item)}
                  title={itemLabel(item)}>
                  <span class="feed-icon" style:color={statusColor(item)}>
                    <Icon name={itemIcon(item)} />
                  </span>
                  <span class="feed-title txt-overflow">{item.title}</span>
                  {#if item.revisionPosition && item.revisionTotal}
                    <span class="feed-revision">
                      Revision {item.revisionPosition} of {item.revisionTotal}
                    </span>
                  {/if}
                  <span class="feed-meta">
                    <span title={absoluteTimestamp(item.timestamp)}>
                      {formatTimestamp(item.timestamp)}
                    </span>
                  </span>
                </a>
              {/each}
            </div>
          {/each}
          {#if !feedExhausted}
            <div class="feed-sentinel" bind:this={feedSentinel}>
              {#if loadingMore}
                <span class="txt-missing txt-body-m-regular">Loading…</span>
              {/if}
            </div>
          {/if}
        {/if}
      {/if}
    </ScrollArea>
  </div>
</Layout>
