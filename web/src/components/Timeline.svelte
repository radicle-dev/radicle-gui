<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
  }

  const { children }: Props = $props();
</script>

<style>
  .timeline {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 1.5rem 0 1rem;
  }
  .timeline::before {
    content: "";
    position: absolute;
    top: 0.5rem;
    bottom: -1rem;
    left: 1rem;
    width: 1px;
    background-color: var(--color-border-mid);
    z-index: 0;
  }
  .timeline > :global(*) {
    position: relative;
    z-index: 1;
  }
</style>

<div class="timeline">{@render children()}</div>
