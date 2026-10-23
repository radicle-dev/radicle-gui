<script lang="ts">
  import type { Snippet } from "svelte";

  import { slide } from "svelte/transition";

  import { dismissed, dismissHint } from "@app/lib/hints.svelte";
  import { motion } from "@app/lib/motion";

  import Icon from "./Icon.svelte";

  interface Props {
    // Stable key for remembering the dismissal.
    id: string;
    // `text` for plain paragraphs, which have no padding of their own.
    variant?: "card" | "text";
    children: Snippet;
  }

  const { id, variant = "card", children }: Props = $props();
</script>

<style>
  .hint {
    position: relative;
  }
  /* Keeps the hint's own text clear of the dismiss button. */
  .hint > :global(*) {
    padding-right: 2.25rem;
  }
  .dismiss {
    all: unset;
    cursor: pointer;
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: inline-flex;
    padding: 0.25rem;
    border-radius: var(--border-radius-sm);
    color: var(--color-text-tertiary);
  }
  .text .dismiss {
    top: -0.125rem;
    right: 0;
  }
  .dismiss:hover {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .dismiss:focus-visible {
    outline: 2px solid var(--color-border-brand);
  }
</style>

{#if !dismissed[id]}
  <div class="hint" class:text={variant === "text"} out:slide={motion({ duration: 180 })}>
    {@render children()}
    <button class="dismiss" title="Dismiss" aria-label="Dismiss hint" onclick={() => dismissHint(id)}>
      <Icon name="close" />
    </button>
  </div>
{/if}
