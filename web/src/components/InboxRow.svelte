<script lang="ts">
  import type { InboxItem } from "@app/node/node.svelte";

  import { timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";
  import { revisionTitle } from "@app/node/repoIdentity";

  import Avatar from "./Avatar.svelte";
  import Icon from "./Icon.svelte";

  interface Props {
    item: InboxItem;
    unread?: boolean;
    showRepo?: boolean;
  }

  const { item, unread = false, showRepo = true }: Props = $props();

  const repo = $derived(item.rid ? node.world.repos[item.rid] : undefined);
  const org = $derived(item.org ? node.org(item.org) : undefined);
  const href = $derived.by(() => {
    if (repo && item.target) {
      return `${node.repoPath(repo)}/${item.target.kind === "issue" ? "issues" : "patches"}/${item.target.id}`;
    }
    if (repo && item.kind === "identity") return `${node.repoPath(repo)}/identity`;
    if (org) return `/${org.handle}?tab=approvals`;
    return "/";
  });
  const icon = $derived.by(() => {
    switch (item.kind) {
      case "issue.opened":
        return "issue" as const;
      case "issue.closed":
        return "issue-closed" as const;
      case "patch.opened":
      case "patch.revision":
        return "patch" as const;
      case "patch.merged":
        return "patch-merged" as const;
      case "patch.review":
        return "comment-checkmark" as const;
      case "org.proposal":
        return "badge" as const;
      case "mention":
        return "hash" as const;
      case "ryph":
        return "lightbulb" as const;
      case "identity":
        return "key" as const;
      default:
        return "comment" as const;
    }
  });

  function markRead() {
    if (!node.read[item.id]) node.do({ type: "readInbox", ids: [item.id] });
  }
</script>

<style>
  a {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    padding: 0.75rem 1rem;
    color: inherit;
    text-decoration: none;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  a:hover {
    background: var(--color-surface-base);
  }
  .icon {
    color: var(--color-text-tertiary);
    padding-top: 0.125rem;
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .line {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .line strong {
    color: var(--color-text-primary);
    font-weight: 600;
  }
  .title {
    font: var(--txt-body-m-semibold);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
  .needs {
    font: var(--txt-body-s-semibold);
    color: var(--color-feedback-important-text);
  }
  .unread {
    background: var(--color-surface-brand-primary);
  }
</style>

<a {href} onclick={markRead}>
  <span class="icon"><Icon name={icon} /></span>
  <div class="body">
    <div class="line ellipsis">
      <Avatar person={item.actor} size="1rem" />
      <strong>{node.person(item.actor).alias}</strong>
      {item.text}
      {#if showRepo && repo}
        in <strong>{node.ownerHandle(repo.owner)}/{repo.name}</strong>
      {/if}
    </div>
    <div class="title ellipsis">
      {#if item.target}
        {item.target.title}
      {:else if repo && item.kind === "identity"}
        {@const rev = repo.identity.revisions.find(r => r.id === item.id)}
        {rev ? revisionTitle(rev, p => node.person(p).alias) : ""}
      {:else if org}
        {org.proposals.find(p => p.id === item.id)?.title ?? org.name}
      {/if}
    </div>
  </div>
  <div class="meta">
    {#if item.needsYou}<span class="needs">Needs you</span>{/if}
    {timeAgo(item.time)}
    {#if unread}<span class="dot unread"></span>{/if}
  </div>
</a>
