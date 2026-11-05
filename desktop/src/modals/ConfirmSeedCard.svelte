<script lang="ts">
  import Icon from "@app/components/Icon.svelte";
  import ConfirmModal from "@app/modals/ConfirmModal.svelte";

  interface Props {
    rid: string;
    confirm: () => Promise<void>;
  }

  const { rid, confirm }: Props = $props();
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
  .rid {
    font: var(--txt-code-regular);
    color: var(--color-text-tertiary);
    word-break: break-all;
  }
</style>

<ConfirmModal
  title="Seed repository"
  width="26rem"
  icon="seed"
  label="Seed"
  busyLabel="Seeding…"
  failure="Unable to seed the repository."
  {confirm}>
  {#snippet body()}
    <div class="repo">
      <span class="repo-icon"><Icon name="repository" /></span>
      Repository of this card
    </div>
    <span class="rid">{rid}</span>
    <span>
      This card comes from a repository your node doesn't have. Seeding it makes
      your node fetch, replicate and announce the repository, and shows the card
      once it arrives.
    </span>
  {/snippet}
</ConfirmModal>
