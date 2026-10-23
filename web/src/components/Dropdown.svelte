<script lang="ts" generics="T extends string">
  import type { ComponentProps } from "svelte";

  import Avatar from "./Avatar.svelte";
  import Icon from "./Icon.svelte";
  import Popover, { closeFocused } from "./Popover.svelte";

  // A select drawn in the app's style instead of the browser's menu.
  interface Option {
    value: T;
    label: string;
    description?: string;
    icon?: ComponentProps<typeof Icon>["name"];
    person?: string;
    org?: string;
    mono?: boolean;
  }

  interface Props {
    options: Option[];
    value: T | undefined;
    onchange: (value: T) => void;
    placeholder?: string;
    id?: string;
    ariaLabel?: string;
    styleWidth?: string;
  }

  const { options, value, onchange, placeholder = "Choose…", id, ariaLabel, styleWidth }: Props = $props();

  const selected = $derived(options.find(o => o.value === value));
  let width = $state(0);
  let menu: HTMLDivElement | undefined = $state();
  let trigger: HTMLButtonElement | undefined = $state();
  let expanded = $state(false);

  // Focus the chosen option once the menu is in the page, so the keyboard
  // starts there.
  // The popover stays hidden until it is positioned, and hidden elements
  // can't take focus, so this retries for a few frames.
  $effect(() => {
    const el = menu;
    if (!el) return;
    let frames = 0;
    let handle = 0;
    const focus = () => {
      const items = [...el.querySelectorAll<HTMLButtonElement>("[role=option]")];
      const target = items.find(i => i.getAttribute("aria-selected") === "true") ?? items[0];
      target?.focus();
      if (target && document.activeElement !== target && frames++ < 10) handle = requestAnimationFrame(focus);
    };
    focus();
    return () => cancelAnimationFrame(handle);
  });

  // Arrow keys on the closed field open it; Escape on it closes it.
  function onTriggerKeydown(e: KeyboardEvent, open: () => void) {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !expanded) {
      e.preventDefault();
      open();
    } else if (e.key === "Escape" && expanded) {
      closeFocused();
    }
  }

  function pick(v: T) {
    onchange(v);
    closeFocused();
    trigger?.focus();
  }

  function onkeydown(e: KeyboardEvent) {
    const items = menu ? [...menu.querySelectorAll<HTMLButtonElement>("[role=option]")] : [];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? Math.min(items.length - 1, at + 1) : Math.max(0, at - 1);
      items[next]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeFocused();
      trigger?.focus();
    } else if (e.key === "Tab") {
      closeFocused();
    }
  }
</script>

<style>
  .wrap {
    display: block;
  }
  .trigger {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    height: 2.25rem;
    padding: 0 0.5rem 0 0.625rem;
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-canvas);
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .trigger:hover {
    border-color: var(--color-border-strong);
  }
  .trigger:focus-visible,
  .trigger.open {
    border-color: var(--color-border-brand);
  }
  .value {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .placeholder {
    color: var(--color-text-tertiary);
  }
  .chevron,
  .lead {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }
  .mono {
    font-family: var(--font-family-code);
  }
  .menu {
    box-sizing: border-box;
    max-height: 18rem;
    overflow-y: auto;
    padding: 0.25rem;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
  }
  .option {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: grid;
    grid-template-columns: 1rem auto minmax(0, 1fr);
    align-items: center;
    column-gap: 0.5rem;
    width: 100%;
    padding: 0.4375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .option:hover,
  .option:focus-visible {
    background: var(--color-surface-subtle);
  }
  .check {
    display: inline-flex;
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .text .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .text .description {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .no-lead {
    grid-column: 2 / 4;
  }
</style>

{#snippet lead(o: Option)}
  {#if o.person}
    <Avatar person={o.person} size="1.125rem" />
  {:else if o.org}
    <Avatar org={o.org} size="1.125rem" />
  {:else if o.icon}
    <span class="lead"><Icon name={o.icon} /></span>
  {/if}
{/snippet}

<div class="wrap" bind:clientWidth={width} style:width={styleWidth}>
  <Popover placement="bottom-start" bind:expanded>
    {#snippet toggle(onclick)}
      <button
        bind:this={trigger}
        {id}
        class="trigger"
        class:open={expanded}
        {onclick}
        onkeydown={e => onTriggerKeydown(e, onclick)}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-label={ariaLabel}>
        <span class="value">
          {#if selected}
            {@render lead(selected)}
            <span class:mono={selected.mono}>{selected.label}</span>
          {:else}
            <span class="placeholder">{placeholder}</span>
          {/if}
        </span>
        <span class="chevron"><Icon name="chevron-down" /></span>
      </button>
    {/snippet}
    {#snippet popover()}
      <div class="menu" role="listbox" tabindex="-1" bind:this={menu} style:min-width={`${width}px`} {onkeydown}>
        {#each options as o (o.value)}
          {@const hasLead = !!(o.person || o.org || o.icon)}
          <button class="option" role="option" aria-selected={o.value === value} onclick={() => pick(o.value)}>
            <span class="check">{#if o.value === value}<Icon name="checkmark" />{/if}</span>
            {#if hasLead}{@render lead(o)}{/if}
            <span class="text" class:no-lead={!hasLead}>
              <span class="label" class:mono={o.mono}>{o.label}</span>
              {#if o.description}<span class="description">{o.description}</span>{/if}
            </span>
          </button>
        {/each}
      </div>
    {/snippet}
  </Popover>
</div>
