<script lang="ts">
  import type { Snippet } from "svelte";

  // What sits under a commented line inside a Pierre diff, mounted into the
  // annotation element Pierre hands back.
  interface Props {
    content: Snippet<[string, number]>;
    path: string;
    line: number;
  }

  const { content, path, line }: Props = $props();
</script>

<style>
  .slot {
    padding: 0.5rem 1rem;
    background: var(--color-surface-base);
    border-top: 1px solid var(--color-border-subtle);
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    white-space: normal;
  }
</style>

<div class="slot">{@render content(path, line)}</div>
