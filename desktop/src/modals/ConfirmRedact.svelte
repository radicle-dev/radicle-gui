<script lang="ts">
  import Icon from "@app/components/Icon.svelte";
  import TextInput from "@app/components/TextInput.svelte";
  import ConfirmModal from "@app/modals/ConfirmModal.svelte";

  interface Props {
    name: string;
    /// Whether this node is currently seeding the bytes, which redacting also
    /// stops.
    seeding: boolean;
    confirm: (reason: string) => Promise<void>;
  }

  const { name, seeding, confirm }: Props = $props();

  let reason = $state("");

  const ready = $derived(reason.trim().length > 0);
</script>

<style>
  .artifact {
    color: var(--color-text-primary);
    word-break: break-all;
  }
  .label {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .warning {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
  }
  .warning-icon {
    display: inline-flex;
    flex-shrink: 0;
    margin-top: 0.125rem;
    color: var(--color-feedback-warning-text);
  }
  .warning-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }
</style>

<ConfirmModal
  title="Redact artifact"
  width="28rem"
  icon="warning"
  label="Redact"
  busyLabel="Redacting…"
  failure="Unable to redact this artifact."
  disabled={!ready}
  confirm={() => confirm(reason.trim())}>
  {#snippet body({ working, run })}
    <span class="artifact">{name}</span>

    <span>
      This marks the artifact as one that should no longer be used, and hides it
      from the release by default.
    </span>

    <label class="label">
      Reason
      <TextInput
        autofocus
        name="redact-reason"
        placeholder="Why should this no longer be used?"
        disabled={working}
        onSubmit={run}
        bind:value={reason} />
    </label>

    <div class="warning">
      <span class="warning-icon"><Icon name="warning" /></span>
      <div class="warning-body">
        <span>
          Nothing is deleted. The CID stays in the release history, and anyone
          who already downloaded it keeps their copy.
        </span>
        {#if seeding}
          <span>
            Your node stops seeding it and removes the location it added.
          </span>
        {/if}
        <span>
          This cannot be undone, and you will not be able to attest to this
          artifact afterwards.
        </span>
      </div>
    </div>
  {/snippet}
</ConfirmModal>
