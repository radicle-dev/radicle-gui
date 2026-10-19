<script lang="ts">
  import type { Repo } from "@app/node/model";

  import { navigate } from "@app/lib/router.svelte";
  import { timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Empty from "@app/components/Empty.svelte";
  import Icon from "@app/components/Icon.svelte";
  import LabelChip from "@app/components/LabelChip.svelte";
  import SegmentedSwitch from "@app/components/SegmentedSwitch.svelte";
  import StateIcon from "@app/components/StateIcon.svelte";

  interface Props {
    repo: Repo;
    filter: string;
  }

  const { repo, filter }: Props = $props();

  let query = $state("");
  let label = $state<string | undefined>(undefined);

  const base = $derived(node.repoPath(repo));
  const open = $derived(repo.issues.filter(i => i.state === "open"));
  const closed = $derived(repo.issues.filter(i => i.state !== "open"));
  const labels = $derived([...new Set(repo.issues.flatMap(i => i.labels))].sort());
  const shown = $derived(
    (filter === "closed" ? closed : filter === "all" ? repo.issues : open)
      .filter(i => !label || i.labels.includes(label))
      .filter(
        i =>
          !query ||
          i.title.toLowerCase().includes(query.toLowerCase()) ||
          i.body.toLowerCase().includes(query.toLowerCase()),
      )
      .sort((a, b) => lastActivity(b) - lastActivity(a)),
  );

  function lastActivity(issue: Repo["issues"][number]) {
    return Math.max(issue.time, ...issue.comments.map(c => c.time));
  }
</script>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .search {
    flex: 1;
    min-width: 12rem;
    max-width: 24rem;
  }
  select {
    width: auto;
  }
  .row-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    text-decoration: none;
    color: inherit;
  }
  .row-item:last-child {
    border-bottom: none;
  }
  .row-item:hover {
    background: var(--color-surface-base);
  }
  .state {
    padding-top: 0.125rem;
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .title {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
    font: var(--txt-body-m-semibold);
  }
  .meta {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .side {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-medium);
  }
  .assignees {
    display: flex;
  }
  .assignees :global(.avatar + .avatar) {
    margin-left: -0.25rem;
  }
</style>

<div class="bar">
  <SegmentedSwitch
    options={[
      { value: "open", label: `${open.length} Open` },
      { value: "closed", label: `${closed.length} Closed` },
      { value: "all", label: "All" },
    ]}
    value={filter === "closed" || filter === "all" ? filter : "open"}
    onchange={v => navigate(`${base}/issues${v === "open" ? "" : `?state=${v}`}`)} />
  <input class="input search" bind:value={query} placeholder="Filter issues" />
  <select class="select" bind:value={label}>
    <option value={undefined}>All labels</option>
    {#each labels as l (l)}<option value={l}>{l}</option>{/each}
  </select>
  <span style="margin-left: auto;"></span>
  <Button variant="secondary" onclick={() => navigate(`${base}/issues/new`)}>
    <Icon name="plus" /> New issue
  </Button>
</div>

<div class="card">
  {#each shown as issue (issue.id)}
    <a class="row-item" href={`${base}/issues/${issue.id}`}>
      <span class="state"><StateIcon kind="issue" state={issue.state} /></span>
      <div class="body">
        <div class="title">
          {issue.title}
          {#each issue.labels as l (l)}<LabelChip label={l} />{/each}
        </div>
        <div class="meta">
          Opened {timeAgo(issue.time)} by {node.person(issue.author).alias}
          {#if issue.state !== "open" && issue.closedAt}
            · {issue.state === "solved" ? "solved" : "closed"} {timeAgo(issue.closedAt)}
          {/if}
        </div>
      </div>
      <div class="side">
        {#if issue.assignees.length > 0}
          <span class="assignees">
            {#each issue.assignees as a (a)}<Avatar person={a} size="1.25rem" />{/each}
          </span>
        {/if}
        {#if issue.comments.length > 0}
          <span class="row" style="gap: 0.25rem;"><Icon name="comment" />{issue.comments.length}</span>
        {/if}
      </div>
    </a>
  {:else}
    <Empty icon="issue" title={query || label ? "No matching issues" : filter === "closed" ? "No closed issues" : "No open issues"}>
      {#if !query && !label}Issues are how people report bugs and propose ideas.{/if}
    </Empty>
  {/each}
</div>
