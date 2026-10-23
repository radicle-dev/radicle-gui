<script lang="ts">
  import type { Repo } from "@app/node/model";

  import { navigate } from "@app/lib/router.svelte";
  import { shortId } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import Avatar from "./Avatar.svelte";
  import Icon from "./Icon.svelte";
  import Popover, { closeFocused } from "./Popover.svelte";

  interface Props {
    repo: Repo;
    // Alias of the selected peer; unset means the canonical refs.
    peer?: string;
    refName: string;
    path: string;
  }

  const { repo, peer, refName, path }: Props = $props();

  let tab = $state<"branches" | "tags">("branches");
  let filter = $state("");
  let open = $state<Record<string, boolean>>({});

  const base = $derived(node.repoPath(repo));
  const selectedPeer = $derived(peer ? node.personByAlias(peer) : undefined);
  const isTag = $derived(!peer && repo.tags.some(t => t.name === refName));
  const canonicalHead = $derived(repo.branches[repo.defaultBranch]);

  const remotes = $derived(
    [...repo.remotes]
      .filter(r => Object.keys(r.branches).length > 0)
      .sort((a, b) => {
        const da = repo.delegates.includes(a.person) ? 0 : 1;
        const db = repo.delegates.includes(b.person) ? 0 : 1;
        if (da !== db) return da - db;
        return node.person(a.person).alias.localeCompare(node.person(b.person).alias);
      }),
  );

  const matches = (name: string) => !filter || name.toLowerCase().includes(filter.toLowerCase());

  function hrefFor(ref: string, alias?: string) {
    const q = alias ? `?peer=${encodeURIComponent(alias)}` : "";
    return `${base}/tree/${ref}${path ? `/${path}` : ""}${q}`;
  }

  function go(ref: string, alias?: string) {
    closeFocused();
    navigate(hrefFor(ref, alias));
  }

  // How a peer's default branch relates to the canonical one.
  function drift(commit: string): string | undefined {
    if (commit === canonicalHead) return undefined;
    const history = node.history(repo, canonicalHead);
    const behind = history.indexOf(commit);
    if (behind > 0) return `${behind} behind`;
    const ahead = node.history(repo, commit).indexOf(canonicalHead);
    if (ahead > 0) return `${ahead} ahead`;
    return "diverged";
  }

  $effect(() => {
    if (selectedPeer) open[selectedPeer.id] = true;
  });
</script>

<style>
  .trigger {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-canvas);
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    cursor: pointer;
    max-width: 24rem;
  }
  .trigger:hover {
    background: var(--color-surface-subtle);
  }
  .sep {
    color: var(--color-text-quaternary);
  }
  .ref {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }
  .ref span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .canonical {
    font: var(--txt-body-s-medium);
    padding: 0 0.375rem;
    border-radius: var(--border-radius-sm);
    background: var(--color-feedback-success-bg);
    color: var(--color-feedback-success-text);
  }
  .delegate {
    display: inline-flex;
    color: var(--color-text-brand);
  }
  .dropdown {
    width: 24rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-canvas);
    box-shadow: var(--elevation-low);
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
  }
  .tabs button {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .tabs button.active,
  .tabs button:hover {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .list {
    max-height: 60vh;
    overflow-y: auto;
    padding: 0.25rem;
  }
  .group {
    padding: 0.5rem 0.5rem 0.25rem;
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
  }
  .peer {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    font: var(--txt-body-m-regular);
  }
  .peer:hover {
    background: var(--color-surface-subtle);
  }
  .peer .count {
    margin-left: auto;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    box-sizing: border-box;
    padding: 0.375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    text-decoration: none;
    color: var(--color-text-secondary);
    font: var(--txt-body-m-regular);
    cursor: pointer;
    background: none;
    border: none;
  }
  .row.nested {
    padding-left: 2rem;
  }
  .row:hover {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .row.selected {
    color: var(--color-text-primary);
    background: var(--color-surface-subtle);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }
  .oid {
    font: var(--txt-code-small);
    color: var(--color-text-tertiary);
  }
  .drift {
    font: var(--txt-body-s-regular);
    color: var(--color-feedback-warning-text);
  }
  .empty {
    padding: 0.75rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
</style>

<Popover placement="bottom-start">
  {#snippet toggle(onclick)}
    <button class="trigger" {onclick} title="Change peer, branch or tag">
      {#if selectedPeer}
        <Avatar person={selectedPeer.id} size="1rem" />
        <span>{selectedPeer.alias}</span>
        {#if repo.delegates.includes(selectedPeer.id)}<span class="delegate" title="Delegate"><Icon name="badge" /></span>{/if}
        <span class="sep">/</span>
      {/if}
      <span class="ref"><Icon name={isTag ? "label" : "branch"} /><span>{refName}</span></span>
      {#if !peer}<span class="canonical">Canonical</span>{/if}
      <Icon name="chevron-down" />
    </button>
  {/snippet}
  {#snippet popover()}
    <div class="dropdown">
      <div class="head">
        {#if repo.tags.length > 0}
          <div class="tabs">
            <button class:active={tab === "branches"} onclick={() => (tab = "branches")}><Icon name="branch" />Branches</button>
            <button class:active={tab === "tags"} onclick={() => (tab = "tags")}><Icon name="label" />Tags</button>
          </div>
        {/if}
        <input class="input" bind:value={filter} placeholder={tab === "branches" ? "Filter branches" : "Filter tags"} />
      </div>
      <div class="list">
        {#if tab === "tags"}
          {#each repo.tags.filter(t => matches(t.name)) as t (t.name)}
            <button class="row" class:selected={!peer && refName === t.name} onclick={() => go(t.name)}>
              <Icon name="label" /><span class="name">{t.name}</span><span class="oid">{shortId(t.commit)}</span>
            </button>
          {:else}
            <div class="empty">No tags match.</div>
          {/each}
        {:else}
          <div class="group">Canonical · agreed by {repo.threshold} of {repo.delegates.length} delegates</div>
          {#each Object.entries(repo.branches).filter(([n]) => matches(n)) as [name, commit] (name)}
            <button class="row" class:selected={!peer && refName === name} onclick={() => go(name)}>
              <Icon name="branch" /><span class="name">{name}</span><span class="oid">{shortId(commit)}</span>
            </button>
          {/each}
          <div class="group">Peers</div>
          {#each remotes as r (r.person)}
            {@const p = node.person(r.person)}
            {@const branches = Object.entries(r.branches).filter(([n]) => matches(n))}
            {#if branches.length > 0 || !filter}
              <button class="peer" onclick={() => (open[r.person] = !open[r.person])}>
                <Avatar person={r.person} size="1rem" />
                <span>{p.alias}</span>
                {#if r.person === "self"}<span class="you-chip">You</span>{/if}
                {#if repo.delegates.includes(r.person)}<span class="delegate" title="Delegate"><Icon name="badge" /></span>{/if}
                <span class="count">{branches.length}</span>
                <Icon name={open[r.person] || filter ? "chevron-up" : "chevron-down"} />
              </button>
              {#if open[r.person] || filter}
                {#each branches as [name, commit] (name)}
                  {@const d = name === repo.defaultBranch ? drift(commit) : undefined}
                  <button
                    class="row nested"
                    class:selected={peer === p.alias && refName === name}
                    onclick={() => go(name, p.alias)}>
                    <Icon name="branch" />
                    <span class="name">{name}</span>
                    {#if d}<span class="drift">{d}</span>{/if}
                    <span class="oid">{shortId(commit)}</span>
                  </button>
                {/each}
              {/if}
            {/if}
          {/each}
        {/if}
      </div>
    </div>
  {/snippet}
</Popover>
