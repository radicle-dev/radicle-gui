<script lang="ts">
  import type { Repo } from "@app/node/model";

  import { untrack } from "svelte";

  import { navigate } from "@app/lib/router.svelte";
  import { shortId, timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import Avatar from "@app/components/Avatar.svelte";
  import PersonLink from "@app/components/PersonLink.svelte";

  interface Props {
    repo: Repo;
  }

  const { repo }: Props = $props();

  let branch = $state(untrack(() => repo.defaultBranch));
  const base = $derived(node.repoPath(repo));
  const commits = $derived(
    node.history(repo, repo.branches[branch] ?? node.head(repo)).map(id => repo.commits[id]),
  );
  const groups = $derived.by(() => {
    const out: { day: string; commits: typeof commits }[] = [];
    for (const c of commits) {
      const day = new Date(c.time).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      const last = out[out.length - 1];
      if (last?.day === day) last.commits.push(c);
      else out.push({ day, commits: [c] });
    }
    return out;
  });
</script>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }
  select {
    width: auto;
  }
  .group {
    margin-bottom: 1.5rem;
  }
  .commit {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .commit:last-child {
    border-bottom: none;
  }
  .commit .body {
    flex: 1;
    min-width: 0;
  }
  .summary {
    font: var(--txt-body-m-semibold);
    color: inherit;
  }
  .meta {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .sha {
    font: var(--txt-code-small);
    color: var(--color-text-secondary);
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0.125rem 0.375rem;
    text-decoration: none;
  }
</style>

<div class="bar">
  <select class="select" bind:value={branch}>
    {#each Object.keys(repo.branches) as b (b)}<option value={b}>{b}</option>{/each}
  </select>
  <span class="muted txt-body-m-regular">{commits.length} commits</span>
</div>

{#each groups as group (group.day)}
  <div class="group">
    <h2 class="section-title">{group.day}</h2>
    <div class="card">
      {#each group.commits as commit (commit.id)}
        <div class="commit">
          <Avatar person={commit.author} size="1.5rem" />
          <div class="body">
            <a class="summary link ellipsis" style="display:block" href={`${base}/commit/${commit.id}`}>
              {commit.summary}
            </a>
            <div class="meta">
              <PersonLink person={commit.author} avatar={false} /> committed {timeAgo(commit.time)}
            </div>
          </div>
          <a class="sha" href={`${base}/commit/${commit.id}`}>{shortId(commit.id)}</a>
          <button
            class="sha"
            style="border:none; cursor:pointer;"
            title="Browse files at this commit"
            onclick={() => navigate(`${base}/tree/${commit.id}`)}>
            {"</>"}
          </button>
        </div>
      {/each}
    </div>
  </div>
{/each}
