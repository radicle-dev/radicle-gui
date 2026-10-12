<script lang="ts">
  import Icon from "@app/components/Icon.svelte";
  import ConfirmModal from "@app/modals/ConfirmModal.svelte";

  interface Props {
    title: string;
    /// Whether other peers registered artifacts in the release, whose refs
    /// keep it alive.
    shared: boolean;
    confirm: () => Promise<void>;
  }

  const { title, shared, confirm }: Props = $props();
</script>

<style>
  .release {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-m-medium);
    color: var(--color-text-primary);
    min-width: 0;
  }
  .release-icon {
    display: inline-flex;
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }
</style>

<ConfirmModal
  title="Delete release"
  width="26rem"
  icon="trash"
  label="Delete"
  busyLabel="Deleting…"
  describeError={() => "Could not delete the release."}
  {confirm}>
  {#snippet body()}
    <div class="release txt-overflow">
      <span class="release-icon"><Icon name="parcel" /></span>
      {title}
    </div>
    <span>
      This removes the release and its artifact list, and your node stops
      seeding its artifacts. Peers that already fetched the release keep their
      copy until they sync.
    </span>
    {#if shared}
      <span>
        Others registered artifacts in this release, so it stays visible with
        their changes.
      </span>
    {/if}
  {/snippet}
</ConfirmModal>
