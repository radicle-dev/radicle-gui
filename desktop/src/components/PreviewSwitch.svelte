<script lang="ts">
  import Icon from "@app/components/Icon.svelte";

  let { preview = $bindable(true) }: { preview?: boolean } = $props();
</script>

<style>
  .container {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    padding: 0.25rem 0.5rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background-color: transparent;
    cursor: pointer;
    white-space: nowrap;
  }
  .toggle:hover {
    background-color: var(--color-surface-strong);
    color: var(--color-text-primary);
  }
  .toggle.active {
    background-color: var(--color-surface-strong);
    color: var(--color-text-primary);
  }
</style>

<div class="container">
  <button
    class="toggle"
    class:active={!preview}
    onclick={() => {
      preview = false;
    }}>
    <Icon name="code" />Code
  </button>

  <button
    class="toggle"
    class:active={preview}
    onclick={() => {
      preview = true;
    }}>
    <Icon name="eye" />Preview
  </button>
</div>
