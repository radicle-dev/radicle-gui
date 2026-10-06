<script lang="ts">
  import { disableHide, enableHide, hide } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    title: string;
    action: string;
    name?: string;
    save: (name: string) => Promise<void>;
  }

  const { title, action, name: initial = "", save }: Props = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(initial);
  let working = $state(false);
  let error = $state<string | undefined>(undefined);

  const valid = $derived(name.trim().length > 0);

  async function submit() {
    if (working || !valid) return;
    working = true;
    error = undefined;
    disableHide();
    try {
      await save(name.trim());
      enableHide();
      hide();
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : ((e as { message?: string }).message ?? "Saving failed.");
      enableHide();
    } finally {
      working = false;
    }
  }
</script>

<style>
  .modal {
    width: 26rem;
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
  }
  .error {
    font: var(--txt-body-m-regular);
    color: var(--color-feedback-error-text);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0 1.5rem 1.5rem;
  }
</style>

<div class="modal">
  <div class="header">
    <span class="title">{title}</span>
    <Button variant="naked" onclick={hide}>
      <span style:color="var(--color-text-tertiary)">
        <Icon name="close" />
      </span>
    </Button>
  </div>
  <div class="body">
    <TextInput
      autofocus
      autoselect
      placeholder="Board name"
      onSubmit={() => void submit()}
      bind:value={name} />
    {#if error}
      <span class="error">{error}</span>
    {/if}
  </div>
  <div class="actions">
    <Button variant="outline" onclick={hide}>Cancel</Button>
    <Button
      variant="secondary"
      disabled={working || !valid}
      onclick={() => void submit()}>
      {working ? "Saving…" : action}
    </Button>
  </div>
</div>
