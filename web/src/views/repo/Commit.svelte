<script lang="ts">
  import type { Repo } from "@app/node/model";

  import { diffSnapshots, diffStats } from "@app/node/diff";
  import { fullDate, plural, shortId } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import DiffView from "@app/components/DiffView.svelte";
  import Empty from "@app/components/Empty.svelte";
  import PersonLink from "@app/components/PersonLink.svelte";

  interface Props {
    repo: Repo;
    sha: string;
  }

  const { repo, sha }: Props = $props();

  const commit = $derived(
    repo.commits[sha] ?? Object.values(repo.commits).find(c => c.id.startsWith(sha)),
  );
  const files = $derived(
    commit
      ? diffSnapshots(
          commit.parents[0] ? repo.snapshots[commit.parents[0]] : {},
          repo.snapshots[commit.id],
        )
      : [],
  );
  const stats = $derived(diffStats(files));
  const body = $derived(commit?.message.split("\n").slice(1).join("\n").trim() ?? "");
  const base = $derived(node.repoPath(repo));
</script>

<style>
  .head {
    margin-bottom: 1.5rem;
  }
  h1 {
    font: var(--txt-heading-l);
    margin: 0 0 0.75rem;
  }
  pre {
    font: var(--txt-code-regular);
    font-size: 0.8125rem;
    white-space: pre-wrap;
    color: var(--color-text-secondary);
    margin: 0 0 1rem;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .sha {
    font: var(--txt-code-small);
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0.125rem 0.375rem;
    color: var(--color-text-secondary);
  }
  .stats {
    margin: 1.5rem 0 1rem;
    font: var(--txt-body-m-medium);
    color: var(--color-text-secondary);
  }
</style>

{#if !commit}
  <Empty icon="commit" title="Commit not found">This commit isn't on your node.</Empty>
{:else}
  <div class="head">
    <h1>{commit.summary}</h1>
    {#if body}<pre>{body}</pre>{/if}
    <div class="meta">
      <PersonLink person={commit.author} /> committed on {fullDate(commit.time)}
      <span class="sha">{shortId(commit.id, 12)}</span>
      {#if commit.parents[0]}
        parent <a class="sha link" href={`${base}/commit/${commit.parents[0]}`}>{shortId(commit.parents[0])}</a>
      {/if}
      <a class="link" href={`${base}/tree/${commit.id}`}>Browse files</a>
    </div>
  </div>
  <div class="stats">
    {plural(stats.files, "file")} changed ·
    <span style="color: var(--color-feedback-success-text)">+{stats.additions}</span>
    <span style="color: var(--color-feedback-error-text)">−{stats.deletions}</span>
  </div>
  <DiffView {files} />
{/if}
