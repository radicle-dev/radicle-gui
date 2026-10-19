<script lang="ts">
  import type { ComponentProps } from "svelte";

  import { onMount } from "svelte";

  import { navigate } from "@app/lib/router.svelte";
  import { modKey } from "@app/lib/shortcuts.svelte";
  import { node } from "@app/node/node.svelte";

  import Avatar from "./Avatar.svelte";
  import Icon from "./Icon.svelte";

  interface Result {
    kind: "repo" | "person" | "org" | "action";
    label: string;
    detail: string;
    href: string;
    icon?: ComponentProps<typeof Icon>["name"];
    person?: string;
    org?: string;
  }

  let open = $state(false);
  let query = $state("");
  let selected = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const all = $derived.by((): Result[] => [
    ...node.repos.map(r => ({
      kind: "repo" as const,
      label: `${node.ownerHandle(r.owner)}/${r.name}`,
      detail: r.description,
      href: node.repoPath(r),
      icon: "repository" as const,
    })),
    ...Object.values(node.world.orgs).map(o => ({
      kind: "org" as const,
      label: o.name,
      detail: `${o.handle} · ${o.members.length} members`,
      href: `/${o.handle}`,
      org: o.id,
    })),
    ...Object.values(node.world.people).map(p => ({
      kind: "person" as const,
      label: p.alias,
      detail: p.name,
      href: `/@${p.alias}`,
      person: p.id,
    })),
    { kind: "action", label: "New repository", detail: "Create a repository", href: "/new", icon: "plus" },
    { kind: "action", label: "New organization", detail: "Start an org with others", href: "/orgs/new", icon: "plus" },
    { kind: "action", label: "Node", detail: "Peers, storage and seeding", href: "/node", icon: "seed" },
    { kind: "action", label: "Settings", detail: "Profile, keys and appearance", href: "/settings", icon: "settings" },
  ]);

  const results = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all.filter(r => r.kind !== "person").slice(0, 8);
    return all
      .filter(
        r =>
          r.label.toLowerCase().includes(q) ||
          r.detail.toLowerCase().includes(q),
      )
      .slice(0, 10);
  });

  function show() {
    open = true;
    query = "";
    selected = 0;
    setTimeout(() => input?.focus());
  }

  function go(result: Result | undefined) {
    if (!result) return;
    open = false;
    navigate(result.href);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selected = Math.min(selected + 1, results.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selected = Math.max(selected - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[selected]);
    } else if (e.key === "Escape") {
      open = false;
    }
  }

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) open = false;
        else show();
      } else if (
        e.key === "/" &&
        !open &&
        !(e.target as HTMLElement).closest("input, textarea, [contenteditable]")
      ) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
</script>

<style>
  .trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    max-width: 22rem;
    height: 2rem;
    padding: 0 0.5rem 0 0.625rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-base);
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
    cursor: text;
  }
  .trigger:hover {
    border-color: var(--color-border-mid);
  }
  .trigger .grow {
    flex: 1;
    text-align: left;
  }
  .scrim {
    position: fixed;
    inset: 0;
    background: var(--color-surface-scrim);
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
  }
  .palette {
    width: min(36rem, calc(100vw - 2rem));
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-lg);
    box-shadow: 0 24px 64px rgb(0 0 0 / 0.25);
    overflow: hidden;
  }
  .palette input {
    width: 100%;
    box-sizing: border-box;
    border: none;
    border-bottom: 1px solid var(--color-border-subtle);
    padding: 1rem 1.125rem;
    font: var(--txt-body-l-regular);
    background: transparent;
    color: var(--color-text-primary);
    outline: none;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0.375rem;
    max-height: 24rem;
    overflow-y: auto;
  }
  li button {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.5rem 0.625rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
  }
  li.selected button {
    background: var(--color-surface-subtle);
  }
  .label {
    font: var(--txt-body-m-semibold);
    white-space: nowrap;
  }
  .detail {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .kind {
    margin-left: auto;
    font: var(--txt-body-s-regular);
    color: var(--color-text-quaternary);
    text-transform: capitalize;
  }
  .none {
    padding: 1rem;
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
</style>

<button class="trigger" onclick={show}>
  <Icon name="search" />
  <span class="grow">Search repos, people, orgs</span>
  <span class="kbd">{modKey}K</span>
</button>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrim" onclick={() => (open = false)}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="palette" onclick={e => e.stopPropagation()}>
      <input
        bind:this={input}
        bind:value={query}
        oninput={() => (selected = 0)}
        {onkeydown}
        placeholder="Search repos, people, orgs, or jump to…" />
      {#if results.length === 0}
        <div class="none">Nothing on your node matches “{query}”.</div>
      {:else}
        <ul>
          {#each results as result, i (result.href + result.label)}
            <li class:selected={i === selected}>
              <button
                onmouseenter={() => (selected = i)}
                onclick={() => go(result)}>
                {#if result.person}
                  <Avatar person={result.person} />
                {:else if result.org}
                  <Avatar org={result.org} />
                {:else if result.icon}
                  <Icon name={result.icon} />
                {/if}
                <span class="label">{result.label}</span>
                <span class="detail ellipsis">{result.detail}</span>
                <span class="kind">{result.kind}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}
