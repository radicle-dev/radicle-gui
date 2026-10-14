<script lang="ts">
  import type { ComponentProps } from "svelte";

  import Icon from "@app/components/Icon.svelte";
  import ConfirmModal from "@app/modals/ConfirmModal.svelte";

  interface Props {
    noun: "issue" | "patch";
    title: string;
    icon: ComponentProps<typeof Icon>["name"];
    confirm: () => Promise<void>;
  }

  const { noun, title, icon, confirm }: Props = $props();
</script>

<style>
  .cob {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-m-medium);
    color: var(--color-text-primary);
    min-width: 0;
  }
  .cob-icon {
    display: inline-flex;
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }
</style>

<ConfirmModal
  title={`Delete ${noun}`}
  width="26rem"
  icon="trash"
  label="Delete"
  busyLabel="Deleting…"
  describeError={() => `Could not delete the ${noun}.`}
  {confirm}>
  {#snippet body()}
    <div class="cob txt-overflow">
      <span class="cob-icon"><Icon name={icon} /></span>
      {title}
    </div>
    <span>
      Only your copy is removed. You won't be able to restore it here, and peers
      who have already replicated the {noun} keep theirs.
    </span>
  {/snippet}
</ConfirmModal>
