<script lang="ts">
  import type { Repo } from "@app/node/model";

  import { languageOf, timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import Icon from "./Icon.svelte";
  import RepoAvatar from "./RepoAvatar.svelte";

  interface Props {
    repo: Repo;
    compact?: boolean;
  }

  const { repo, compact = false }: Props = $props();

  const head = $derived(repo.commits[node.head(repo)]);
  const language = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const path of Object.keys(repo.snapshots[node.head(repo)] ?? {})) {
      const lang = languageOf(path);
      if (lang && lang !== "Markdown" && lang !== "TOML" && lang !== "JSON") {
        counts[lang] = (counts[lang] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  });
  const openIssues = $derived(repo.issues.filter(i => i.state === "open").length);
  const openPatches = $derived(repo.patches.filter(p => p.state === "open").length);
</script>

<style>
  a {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    color: inherit;
    text-decoration: none;
    height: 100%;
    box-sizing: border-box;
  }
  .top {
    display: flex;
    gap: 0.625rem;
    align-items: center;
  }
  .avatar {
    border-radius: var(--border-radius-sm);
    overflow: hidden;
    flex-shrink: 0;
  }
  .name {
    font: var(--txt-body-m-semibold);
  }
  .owner {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .desc {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .meta {
    margin-top: auto;
    display: flex;
    gap: 0.875rem;
    flex-wrap: wrap;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .meta span {
    display: inline-flex;
    gap: 0.25rem;
    align-items: center;
  }
  .private {
    color: var(--color-feedback-warning-text);
  }
</style>

<a href={node.repoPath(repo)} class="card">
  <div class="top">
    <span class="avatar">
      <RepoAvatar name={repo.name} rid={repo.rid} styleWidth="2rem" />
    </span>
    <div class="stack" style="gap: 0; min-width: 0;">
      <span class="name ellipsis">{repo.name}</span>
      <span class="owner ellipsis">{node.ownerHandle(repo.owner)}</span>
    </div>
  </div>
  {#if !compact}<div class="desc">{repo.description}</div>{/if}
  <div class="meta">
    {#if repo.visibility === "private"}
      <span class="private"><Icon name="lock" />Private</span>
    {/if}
    {#if language}<span>{language}</span>{/if}
    <span><Icon name="issue" />{openIssues}</span>
    <span><Icon name="patch" />{openPatches}</span>
    <span title={node.seeding[repo.rid] ? "Your node seeds this" : "Not on your node"}>
      <Icon name="seed" />{repo.seedCount}
    </span>
    {#if head}<span>Updated {timeAgo(head.time)}</span>{/if}
  </div>
</a>
