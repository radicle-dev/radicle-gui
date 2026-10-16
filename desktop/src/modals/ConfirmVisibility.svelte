<script lang="ts">
  import Icon from "@app/components/Icon.svelte";
  import ConfirmModal from "@app/modals/ConfirmModal.svelte";

  interface Props {
    name: string;
    private: boolean;
    majority: number;
    confirm: () => Promise<void>;
  }

  const { name, private: toPrivate, majority, confirm }: Props = $props();
</script>

<style>
  .repo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-m-medium);
    color: var(--color-text-primary);
    min-width: 0;
  }
  .repo-icon {
    display: inline-flex;
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }
  .note {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
</style>

<ConfirmModal
  title={toPrivate ? "Make private" : "Make public"}
  width="26rem"
  icon={toPrivate ? "lock" : "globe"}
  label={toPrivate ? "Make private" : "Make public"}
  busyLabel="Updating…"
  failure="Unable to change the visibility."
  {confirm}>
  {#snippet body()}
    <div class="repo txt-overflow">
      <span class="repo-icon"><Icon name="repository" /></span>
      {name}
    </div>

    <div class="note txt-body-m-regular">
      {#if toPrivate}
        <span>
          Only the delegates will be able to fetch this repository. Nodes that
          already have a copy keep it.
        </span>
      {:else}
        <span>
          Anyone on the network will be able to fetch and replicate this
          repository, and your node will announce it to peers. Everything in it,
          including its history, becomes public.
        </span>
      {/if}
      {#if majority > 1}
        <span>
          This proposes a new revision of the identity document. It takes effect
          once {majority} delegates have signed it.
        </span>
      {/if}
    </div>
  {/snippet}
</ConfirmModal>
