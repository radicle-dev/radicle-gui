<script lang="ts">
  import { untrack } from "svelte";

  import { node } from "@app/node/node.svelte";

  import { toast } from "@app/lib/toast.svelte";
  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";
  import ConfirmDialog from "@app/components/ConfirmDialog.svelte";
  import Empty from "@app/components/Empty.svelte";
  import InboxRow from "@app/components/InboxRow.svelte";
  import SegmentedSwitch from "@app/components/SegmentedSwitch.svelte";

  type Filter = "all" | "needs" | "unread";

  interface Props {
    // The filter to start on, from the URL, e.g. from Home's summary.
    filter?: string;
  }

  const { filter: initial }: Props = $props();
  let filter = $state<Filter>(untrack(() => (initial === "needs" || initial === "unread" ? initial : "all")));
  let repoFilter = $state<string | undefined>(undefined);

  const items = $derived(
    node.inbox.filter(i => {
      if (filter === "needs" && !i.needsYou) return false;
      if (filter === "unread" && node.read[i.id]) return false;
      if (repoFilter && i.rid !== repoFilter && i.org !== repoFilter) return false;
      return true;
    }),
  );

  const sources = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one call, never reactive
    const counts = new Map<string, number>();
    for (const i of node.inbox) {
      const key = i.rid ?? i.org;
      if (key && !node.read[i.id]) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...new Set(node.inbox.map(i => i.rid ?? i.org).filter(Boolean))].map(
      key => {
        const repo = node.world.repos[key as string];
        const org = node.org(key as string);
        return {
          key: key as string,
          label: repo ? `${node.ownerHandle(repo.owner)}/${repo.name}` : (org?.name ?? ""),
          repo,
          org,
          count: counts.get(key as string) ?? 0,
        };
      },
    );
  });

  const groups = $derived.by(() => {
    const out: { label: string; items: typeof items }[] = [];
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one call, never reactive
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const label = (t: number) => {
      const days = Math.floor((today.getTime() - t) / 86400000) + 1;
      if (t >= today.getTime()) return "Today";
      if (days <= 1) return "Yesterday";
      if (days < 7) return "This week";
      return "Earlier";
    };
    for (const item of items) {
      const l = label(item.time);
      const last = out[out.length - 1];
      if (last?.label === l) last.items.push(item);
      else out.push({ label: l, items: [item] });
    }
    return out;
  });

  let confirming = $state(false);
  const unread = $derived(items.filter(i => !node.read[i.id]));

  function markAll() {
    const ids = unread.map(i => i.id);
    node.do({ type: "readInbox", ids });
    toast(`Marked ${ids.length} ${ids.length === 1 ? "notification" : "notifications"} as read`, {
      icon: "mark-read",
      duration: 8000,
      countdown: true,
      action: { label: "Undo", run: () => node.do({ type: "unreadInbox", ids }) },
    });
  }
</script>

<style>
  .layout {
    display: grid;
    grid-template-columns: 15rem minmax(0, 1fr);
    gap: 2rem;
  }
  h1 {
    font: var(--txt-heading-xl);
    margin: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    gap: 1rem;
  }
  .group {
    margin-bottom: 1.5rem;
  }
  .group .card {
    overflow: hidden;
  }
  .group .card :global(a:last-child) {
    border-bottom: none;
  }
  .sources button {
    all: unset;
    box-sizing: border-box;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    padding: 0.4375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    cursor: pointer;
    color: var(--color-text-secondary);
  }
  .sources button:hover,
  .sources button.active {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .source {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .source-avatar,
  .source-icon {
    display: inline-flex;
    flex-shrink: 0;
    width: 1.25rem;
    justify-content: center;
  }
  .source-icon {
    color: var(--color-text-tertiary);
  }
  .sources button {
    align-items: center;
  }
  .count {
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
  }
  @media (max-width: 860px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .sources {
      display: none;
    }
  }
</style>

<div class="page">
  <div class="bar">
    <h1>Inbox</h1>
  </div>
  <div class="layout">
    <div class="sources">
      <button class:active={!repoFilter} onclick={() => (repoFilter = undefined)}>
        <span class="source">
          <span class="source-icon"><Icon name="inbox" /></span>
          Everything
        </span>
        <span class="count">{node.unreadCount}</span>
      </button>
      {#each sources as s (s.key)}
        <button class:active={repoFilter === s.key} onclick={() => (repoFilter = s.key)}>
          <span class="source">
            {#if s.repo}
              <span class="source-avatar"><RepoAvatar name={s.repo.name} rid={s.repo.rid} styleWidth="1.25rem" /></span>
            {:else if s.org}
              <Avatar org={s.org.id} size="1.25rem" />
            {/if}
            <span class="ellipsis">{s.label}</span>
          </span>
          {#if s.count > 0}<span class="count">{s.count}</span>{/if}
        </button>
      {/each}
    </div>
    <div>
      <div class="bar">
        <SegmentedSwitch
          options={[
            { value: "all", label: "All" },
            { value: "needs", label: "Needs you" },
            { value: "unread", label: "Unread" },
          ]}
          value={filter}
          onchange={v => (filter = v)} />
        <Button variant="ghost" onclick={() => (confirming = true)} disabled={unread.length === 0}>
          Mark all as read
        </Button>
        <ConfirmDialog
          bind:open={confirming}
          title={`Mark ${unread.length} ${unread.length === 1 ? "notification" : "notifications"} as read?`}
          confirmLabel="Mark all as read"
          onConfirm={markAll}>
          They'll move out of your unread list.
        </ConfirmDialog>
      </div>
      {#each groups as group (group.label)}
        <div class="group">
          <h2 class="section-title">{group.label}</h2>
          <div class="card">
            {#each group.items as item (item.id)}
              <InboxRow {item} unread={!node.read[item.id]} />
            {/each}
          </div>
        </div>
      {:else}
        <Empty icon="inbox" title="You're all caught up">
          New activity from your repos, patches and orgs shows up here.
        </Empty>
      {/each}
    </div>
  </div>
</div>
