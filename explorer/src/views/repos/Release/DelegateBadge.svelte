<script lang="ts">
  import Icon from "@app/components/Icon.svelte";

  export let style: string | undefined = undefined;
  export let tooltip: string = "Delegate";
</script>

<style>
  .delegate {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }
  /* Tighten the gap when the badge follows another element, e.g. a NodeId,
     in a flex row — the icon's own whitespace makes a full gap look loose. */
  .delegate:not(:first-child) {
    margin-left: -0.25rem;
  }
  .tooltip {
    position: absolute;
    bottom: 1.5rem;
    left: 0;
    display: none;
    z-index: 20;
    padding: 0.25rem 0.5rem;
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
    font: var(--txt-body-s-regular);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    box-shadow: var(--elevation-low);
    white-space: nowrap;
  }
  .delegate:hover .tooltip {
    display: block;
  }
</style>

<span class="delegate" {style}>
  <Icon name="badge" />
  <span class="tooltip">{tooltip}</span>
</span>
