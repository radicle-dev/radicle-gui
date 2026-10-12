<script lang="ts">
  import type { ComponentProps, Snippet } from "svelte";

  import { disableHide, enableHide, hide } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";

  interface Props {
    title: string;
    width: string;
    icon: ComponentProps<typeof Icon>["name"];
    label: string;
    busyLabel: string;
    failure?: string;
    confirm: () => Promise<void>;
    body: Snippet<[{ working: boolean; run: () => void }]>;
    disabled?: boolean;
    canConfirm?: boolean;
    describeError?: (error: unknown) => string;
  }

  const {
    title,
    width,
    icon,
    label,
    busyLabel,
    failure = "Something went wrong.",
    confirm,
    body,
    disabled = false,
    canConfirm = true,
    describeError = error => (error instanceof Error ? error.message : failure),
  }: Props = $props();

  let working = $state(false);
  let error = $state<string | undefined>(undefined);

  async function run() {
    if (working || disabled) return;
    working = true;
    error = undefined;
    disableHide();
    try {
      await confirm();
      enableHide();
      hide();
    } catch (e) {
      error = describeError(e);
      enableHide();
    } finally {
      working = false;
    }
  }
</script>

<style>
  .modal {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-lg);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    height: 3.25rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .title {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .error {
    color: var(--color-feedback-error-text);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0 1.5rem 1.5rem;
  }
  .confirm-label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>

<div class="modal" style:width>
  <div class="header">
    <span class="title">{title}</span>
    <Button variant="naked" onclick={hide}>
      <span style:color="var(--color-text-tertiary)">
        <Icon name="close" />
      </span>
    </Button>
  </div>

  <div class="body">
    {@render body({ working, run: () => void run() })}

    {#if error}
      <span class="error">{error}</span>
    {/if}
  </div>

  <div class="actions">
    {#if canConfirm}
      <Button variant="outline" onclick={hide}>Cancel</Button>
      <Button
        variant="ghost"
        disabled={working || disabled}
        onclick={() => void run()}>
        <span class="confirm-label">
          <Icon name={icon} />
          {working ? busyLabel : label}
        </span>
      </Button>
    {:else}
      <Button variant="outline" onclick={hide}>Close</Button>
    {/if}
  </div>
</div>
