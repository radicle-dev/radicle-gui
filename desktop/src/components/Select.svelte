<script lang="ts" generics="T extends string">
  import {
    autoUpdate,
    computePosition,
    flip,
    offset,
    shift,
  } from "@floating-ui/dom";

  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";

  interface Props {
    options: { value: T; label: string }[];
    value: T;
    label: string;
    disabled?: boolean;
    title?: string;
    onchange?: (value: T) => void;
  }

  /* eslint-disable prefer-const */
  let {
    options,
    value = $bindable(),
    label,
    disabled = false,
    title,
    onchange,
  }: Props = $props();
  /* eslint-enable prefer-const */

  let open = $state(false);
  let active = $state(0);
  let containerEl: HTMLDivElement | undefined = $state();
  let triggerEl: HTMLButtonElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();

  const current = $derived(options.find(o => o.value === value));

  function show() {
    if (disabled) return;
    active = Math.max(
      0,
      options.findIndex(o => o.value === value),
    );
    open = true;
  }

  function pick(next: T) {
    value = next;
    onchange?.(next);
    open = false;
    triggerEl?.focus();
  }

  function onkeydown(event: KeyboardEvent) {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) {
          show();
          return;
        }
        const step = event.key === "ArrowDown" ? 1 : -1;
        active = (active + step + options.length) % options.length;
        break;
      }
      case "Enter":
      case " ":
        if (open) {
          event.preventDefault();
          pick(options[active].value);
        }
        break;
      case "Escape":
        // Only this list closes, not a menu or modal it sits in.
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          open = false;
        }
        break;
      case "Tab":
        open = false;
        break;
    }
  }

  function onWindowPointerDown(event: PointerEvent) {
    if (open && containerEl && !event.composedPath().includes(containerEl)) {
      open = false;
    }
  }

  // The list stays inside the component rather than in a portal, so a click
  // in it counts as a click inside any popover or modal the select sits in.
  $effect(() => {
    if (!open || !triggerEl || !listEl) return;
    const trigger = triggerEl;
    const list = listEl;
    return autoUpdate(trigger, list, () => {
      void computePosition(trigger, list, {
        strategy: "fixed",
        placement: "bottom-start",
        middleware: [offset(4), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        list.style.left = `${x}px`;
        list.style.top = `${y}px`;
        list.style.visibility = "visible";
      });
    });
  });
</script>

<style>
  .select {
    display: inline-flex;
    min-width: 0;
  }
  .trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-primary);
    font: var(--txt-body-m-regular);
    cursor: pointer;
  }
  .trigger:focus-visible,
  .trigger.open {
    outline: none;
    border-color: var(--color-border-brand);
  }
  .trigger:disabled {
    color: var(--color-text-disabled);
    background-color: var(--color-surface-base);
    cursor: default;
  }
  .chevron {
    display: flex;
    color: var(--color-text-tertiary);
  }
  .list {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 500;
    visibility: hidden;
    min-width: 10rem;
    padding: 0.25rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    box-shadow: var(--elevation-low);
  }
  .check {
    display: flex;
    margin-left: auto;
    color: var(--color-text-tertiary);
  }
</style>

<svelte:window onpointerdown={onWindowPointerDown} />

<div class="select" bind:this={containerEl}>
  <button
    bind:this={triggerEl}
    type="button"
    class="trigger"
    class:open
    aria-label={label}
    aria-haspopup="listbox"
    aria-expanded={open}
    {disabled}
    {title}
    onclick={() => (open ? (open = false) : show())}
    {onkeydown}>
    <span class="txt-overflow">{current?.label ?? ""}</span>
    <span class="chevron">
      <Icon name={open ? "chevron-up" : "chevron-down"} />
    </span>
  </button>
  {#if open}
    <div class="list" role="listbox" aria-label={label} bind:this={listEl}>
      {#each options as option, index (option.value)}
        <DropdownListItem
          selected={index === active}
          styleGap="0.5rem"
          styleWidth="100%"
          onclick={() => pick(option.value)}>
          <span>{option.label}</span>
          {#if option.value === value}
            <span class="check"><Icon name="checkmark" /></span>
          {/if}
        </DropdownListItem>
      {/each}
    </div>
  {/if}
</div>
