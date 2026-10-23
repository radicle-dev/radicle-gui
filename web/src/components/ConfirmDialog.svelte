<script lang="ts">
  import type { Snippet } from "svelte";

  import Button from "./Button.svelte";

  interface Props {
    open: boolean;
    title: string;
    confirmLabel: string;
    children?: Snippet;
    onConfirm: () => void;
  }

  /* eslint-disable prefer-const */
  let { open = $bindable(), title, confirmLabel, children, onConfirm }: Props = $props();
  /* eslint-enable prefer-const */

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<style>
  dialog {
    width: min(26rem, calc(100vw - 2rem));
    box-sizing: border-box;
    padding: 1.25rem;
    background: var(--color-surface-canvas);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-lg);
    box-shadow: 0 24px 64px rgb(0 0 0 / 0.25);
  }
  dialog::backdrop {
    background: var(--color-surface-scrim);
  }
  h2 {
    font: var(--txt-heading-s);
    margin: 0 0 0.5rem;
  }
  .body {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.25rem;
  }
</style>

<dialog
  bind:this={dialog}
  onclose={() => (open = false)}
  onclick={e => {
    if (e.target === dialog) open = false;
  }}>
  <h2>{title}</h2>
  {#if children}<div class="body">{@render children()}</div>{/if}
  <div class="actions">
    <Button variant="naked" onclick={() => (open = false)}>Cancel</Button>
    <Button
      variant="secondary"
      onclick={() => {
        open = false;
        onConfirm();
      }}>
      {confirmLabel}
    </Button>
  </div>
</dialog>
