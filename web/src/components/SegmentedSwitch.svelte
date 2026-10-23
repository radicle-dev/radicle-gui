<script lang="ts" generics="T extends string">
  import type { ComponentProps } from "svelte";

  import { untrack } from "svelte";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    /// Two or more mutually exclusive choices, in the order they are shown. An
    /// option shows a glyph, a word, or a glyph followed by a word.
    options: {
      value: T;
      label?: string;
      icon?: ComponentProps<typeof Icon>["name"];
      title?: string;
    }[];
    value: T;
    onchange: (value: T) => void;
  }

  const { options, value, onchange }: Props = $props();

  let row: HTMLDivElement | undefined = $state();
  const segments: Record<string, HTMLButtonElement> = $state({});
  let hovered = $state<T | undefined>(undefined);
  let pill = $state<{ left: number; width: number } | undefined>(undefined);
  // Skips the slide when the pill first appears.
  let ready = $state(false);

  const target = $derived(hovered ?? value);

  function measure() {
    const el = segments[target];
    pill = el ? { left: el.offsetLeft, width: el.offsetWidth } : undefined;
  }

  $effect(() => {
    void target;
    void options;
    measure();
    untrack(() => {
      if (pill && !ready) requestAnimationFrame(() => (ready = true));
    });
  });

  // Watches every item, not just the row: a web font loading or a count
  // changing moves items without changing the row's size.
  $effect(() => {
    if (!row) return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    for (const el of Object.values(segments)) if (el) observer.observe(el);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  });
</script>

<style>
  /* One outline around the row and one fill that rests on the chosen segment
     and slides to the hovered one, like the line under the repo tabs. */
  .switch {
    position: relative;
    display: flex;
    align-items: center;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    overflow: hidden;
  }
  .pill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    background: var(--color-surface-subtle);
    pointer-events: none;
  }
  .pill.away {
    background: var(--color-surface-alpha-subtle);
  }
  .pill.ready {
    transition:
      transform 0.2s ease,
      width 0.2s ease,
      background-color 0.2s ease;
  }
  button {
    all: unset;
    box-sizing: border-box;
    position: relative;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    height: 2rem;
    padding: 0 0.5rem;
    font: var(--txt-body-m-medium);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  button:hover,
  button.selected {
    color: var(--color-text-primary);
  }
  button:focus-visible {
    outline: 2px solid var(--color-border-brand);
    outline-offset: -2px;
  }
</style>

<div class="switch" role="radiogroup" tabindex="-1" bind:this={row} onmouseleave={() => (hovered = undefined)}>
  {#if pill}
    <span
      class="pill"
      class:away={target !== value}
      class:ready
      style:width={`${pill.width}px`}
      style:transform={`translateX(${pill.left}px)`}></span>
  {/if}
  {#each options as option (option.value)}
    <button
      bind:this={segments[option.value]}
      role="radio"
      aria-checked={value === option.value}
      aria-label={option.icon && !option.label ? (option.title ?? option.value) : undefined}
      class:selected={value === option.value}
      title={option.title}
      onmouseenter={() => (hovered = option.value)}
      onfocus={() => (hovered = option.value)}
      onblur={() => (hovered = undefined)}
      onclick={() => onchange(option.value)}>
      {#if option.icon}<Icon name={option.icon} />{/if}
      {#if option.label}{option.label}{/if}
    </button>
  {/each}
</div>
