<script lang="ts">
  import * as modal from "@app/lib/modal";

  import Button from "./Button.svelte";

  export let title: string | undefined = undefined;
  export let showCloseButton: boolean = false;
</script>

<style>
  .modal {
    padding: 2rem;
    border-radius: var(--border-radius-md);
    background: var(--color-surface-subtle);
    border: 1px solid var(--color-border-subtle);
    box-shadow: var(--elevation-low);
    min-width: 34rem;
    max-width: 100vw;
    gap: 1.5rem;
    display: flex;
    flex-direction: column;
  }
  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .title {
    font: var(--txt-heading-l);
    text-align: center;
    text-overflow: ellipsis;
    overflow: hidden;
  }
  .subtitle {
    font: var(--txt-heading-s);
    text-align: center;
  }
  .body {
    font: var(--txt-body-m-regular);
    display: flex;
    justify-content: center;
  }
  .actions {
    margin-top: 1rem;
    display: flex;
    justify-content: center;
  }
</style>

<div class="modal">
  {#if $$slots.icon}
    <div class="icon">
      <slot name="icon" />
    </div>
  {/if}

  <div style="display: flex; flex-direction: column; gap: 0.5rem;">
    {#if title}
      <div class="title">{title}</div>
    {/if}

    {#if $$slots.subtitle}
      <div class="subtitle">
        <slot name="subtitle" />
      </div>
    {/if}
  </div>

  {#if $$slots.body}
    <div class="body">
      <slot name="body" />
    </div>
  {/if}

  {#if showCloseButton}
    <div class="actions">
      <Button variant="outline" on:click={modal.hide}>Close</Button>
    </div>
  {/if}
</div>
