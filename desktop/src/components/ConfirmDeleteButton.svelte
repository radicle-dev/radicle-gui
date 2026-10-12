<script lang="ts">
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";

  interface Props {
    noun: string;
    onDelete: () => Promise<void>;
  }

  const { noun, onDelete }: Props = $props();

  let expanded = $state(false);
  let deleting = $state(false);

  async function confirm() {
    deleting = true;
    try {
      await onDelete();
    } finally {
      deleting = false;
      closeFocused();
    }
  }
</script>

<style>
  .confirm-delete {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    min-width: 16rem;
    max-width: 24rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
  }
  .confirm-delete-text {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: var(--color-text-primary);
  }
  .confirm-delete-note {
    color: var(--color-text-secondary);
  }
  .confirm-delete-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .confirm-delete-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 2rem;
    padding: 0 0.75rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-feedback-error-fill);
    color: var(--color-text-on-brand);
    cursor: pointer;
    transition: background-color 0.1s ease;
  }
  .confirm-delete-button:hover:not(:disabled),
  .confirm-delete-button:focus-visible:not(:disabled) {
    background-color: var(--color-feedback-error-fill-hover);
  }
  .confirm-delete-button:active:not(:disabled) {
    background-color: var(--color-feedback-error-fill-active);
  }
  .confirm-delete-button:disabled {
    cursor: default;
    opacity: 0.6;
  }
</style>

<Popover popoverPadding="0" placement="bottom-end" bind:expanded>
  {#snippet toggle(onclick)}
    <Button
      variant="naked"
      {onclick}
      active={expanded}
      title={`Delete ${noun} from your node`}>
      <Icon name="trash" />
      <span class="global-hide-on-medium-desktop-down">Delete</span>
    </Button>
  {/snippet}
  {#snippet popover()}
    <div class="confirm-delete">
      <div class="confirm-delete-text">
        <div class="txt-body-m-medium">Delete this {noun} from your node?</div>
        <div class="confirm-delete-note txt-body-m-regular">
          Only your copy is removed. You won't be able to restore it here, and
          peers who have already replicated the {noun} keep theirs.
        </div>
      </div>
      <div class="confirm-delete-actions">
        <Button variant="outline" disabled={deleting} onclick={closeFocused}>
          Cancel
        </Button>
        <button
          type="button"
          class="confirm-delete-button txt-body-m-medium"
          disabled={deleting}
          onclick={confirm}>
          <Icon name="trash" />
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  {/snippet}
</Popover>
