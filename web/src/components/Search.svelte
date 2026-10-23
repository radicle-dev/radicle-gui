<script lang="ts" module>
  // Shared so other triggers, like the compact header icon, can open it.
  const palette = $state({ request: 0 });

  export function openSearch() {
    palette.request++;
  }
</script>

<script lang="ts">
  import type { ComponentProps } from "svelte";

  import { onMount } from "svelte";
  import { cubicIn, cubicOut } from "svelte/easing";
  import { fade } from "svelte/transition";

  import { navigate } from "@app/lib/router.svelte";
  import { modKey } from "@app/lib/shortcuts.svelte";
  import { motion } from "@app/lib/motion";
  import { portal } from "@app/lib/portal";
  import { node } from "@app/node/node.svelte";
  import { chooseSeed, exploreSeed, seedLabel } from "@app/lib/exploreSeed.svelte";
  import { orgsOn, peopleOn, reposOn } from "@app/lib/seedContent";
  import { LOCAL_NODE } from "@app/node/seedNodes";

  import Avatar from "./Avatar.svelte";
  import Icon from "./Icon.svelte";
  import SeedSelector from "./SeedSelector.svelte";

  interface Result {
    kind: "repo" | "person" | "org" | "action";
    label: string;
    detail: string;
    href: string;
    icon?: ComponentProps<typeof Icon>["name"];
    person?: string;
    org?: string;
    // Shown instead of the kind, e.g. for repos your node doesn't seed yet.
    tag?: string;
  }

  let open = $state(false);

  $effect(() => {
    if (palette.request > 0) show();
  });
  let query = $state("");
  let selected = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const seed = $derived(exploreSeed.current);
  const unique = <T extends { id?: string; rid?: string }>(items: T[]) =>
    [...new Map(items.map(i => [i.rid ?? i.id, i])).values()];

  // What the selected seed knows, plus everything on your own node.
  const all = $derived.by((): Result[] => [
    ...unique([...reposOn(seed), ...reposOn(LOCAL_NODE)]).map(r => ({
      kind: "repo" as const,
      label: `${node.ownerHandle(r.owner)}/${r.name}`,
      detail: r.description,
      href: node.repoPath(r),
      icon: "repository" as const,
      tag: node.seeding[r.rid] ? undefined : "Not seeded",
    })),
    ...unique([...orgsOn(seed), ...node.myOrgs]).map(o => ({
      kind: "org" as const,
      label: o.name,
      detail: `${o.handle} · ${o.members.length} members`,
      href: `/${o.handle}`,
      org: o.id,
    })),
    ...unique([...peopleOn(seed), ...peopleOn(LOCAL_NODE)]).map(p => ({
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
    const params = new URLSearchParams({ seed, q: query.trim() });
    return [
      ...all
        .filter(
          r =>
            r.label.toLowerCase().includes(q) ||
            r.detail.toLowerCase().includes(q),
        )
        .slice(0, 9),
      {
        kind: "action" as const,
        label: `Search ${seedLabel(seed)} for “${query.trim()}”`,
        detail: "",
        href: `/explore?${params}`,
        icon: "explore" as const,
      },
    ];
  });

  let trigger: HTMLButtonElement | undefined = $state();

  // The search field itself turns into the palette: the palette starts at the
  // field's position and size, then moves and opens out to its own, revealing
  // its edges with a clip so nothing inside is squashed. Closing runs it back.
  function morph(
    node: Element,
    {
      duration = 260,
      easing = cubicOut,
      fade = false,
    }: { duration?: number; easing?: (t: number) => number; fade?: boolean },
  ) {
    const from = sourceRect();
    const to = node.getBoundingClientRect();
    if (!from || from.width === 0) {
      return { duration, easing, css: (t: number) => `opacity: ${t}` };
    }
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const right = Math.max(0, to.width - from.width);
    const bottom = Math.max(0, to.height - from.height);
    return {
      duration,
      easing,
      // Fades over the last half, so closing hands over to the search field
      // fading back in underneath rather than snapping to it.
      css: (t: number, u: number) =>
        `transform: translate(${dx * u}px, ${dy * u}px);
         clip-path: inset(0 ${right * u}px ${bottom * u}px 0 round var(--border-radius-lg));
         opacity: ${fade ? Math.min(1, t * 2) : 1};`,
    };
  }

  // The visible search control: the field on wide screens, the header icon on
  // narrow ones.
  function sourceRect(): DOMRect | undefined {
    if (trigger && trigger.offsetParent !== null) return trigger.getBoundingClientRect();
    const icon = document.querySelector<HTMLElement>("header .search-icon");
    return icon && icon.offsetParent !== null ? icon.getBoundingClientRect() : undefined;
  }

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
  /* Hidden at once when the palette opens out of it; on close it fades in and
     rises into place while the palette is still shrinking into it. */
  .trigger {
    transition:
      opacity 0.2s ease 0.04s,
      transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) 0.04s,
      border-color 0.12s ease;
  }
  .trigger.hidden {
    opacity: 0;
    transform: translateY(6px);
    transition: none;
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
  .foot {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--color-border-subtle);
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .kind.tag {
    text-transform: none;
  }
  .kind {
    white-space: nowrap;
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

<button class="trigger" class:hidden={open} bind:this={trigger} onclick={show}>
  <Icon name="search" />
  <span class="grow">Search the network</span>
  <span class="kbd">{modKey}K</span>
</button>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="scrim"
    use:portal
    in:fade={motion({ duration: 160 })}
    out:fade={motion({ duration: 120 })}
    onclick={e => {
      if (e.target === e.currentTarget) open = false;
    }}>
    <div
      class="palette"
      in:morph={motion({ duration: 260, easing: cubicOut })}
      out:morph={motion({ duration: 200, easing: cubicIn, fade: true })}>
      <input
        bind:this={input}
        bind:value={query}
        oninput={() => (selected = 0)}
        {onkeydown}
        placeholder="Search the network, or jump to…" />
      {#if results.length === 0}
        <div class="none">Nothing on {seedLabel(seed)} or your node matches “{query}”.</div>
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
                {#if result.tag}
                  <span class="kind tag">{result.tag}</span>
                {:else}
                  <span class="kind">{result.kind}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="foot">
        <span>Searching</span>
        <SeedSelector value={seed} onchange={s => chooseSeed(s)} placement="top-start" styleZIndex="500" />
        <span>and your node</span>
      </div>
    </div>
  </div>
{/if}
