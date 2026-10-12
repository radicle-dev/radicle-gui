<script lang="ts">
  import { repoListScope } from "@app/lib/repoListScope";

  import Checkbox from "@app/components/Checkbox.svelte";
  import Icon from "@app/components/Icon.svelte";
  import ConfirmModal from "@app/modals/ConfirmModal.svelte";

  interface Props {
    name: string;
    rid: string;
    confirm: (clean: boolean) => Promise<void>;
  }

  const { name, rid, confirm }: Props = $props();

  let clean = $state(false);
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
  /* Deliberately not a warning band: `rad unseed` drops the seeding policy and
     nothing else, so this is reversible and loses no data. */
  .note {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .note-icon {
    display: inline-flex;
    flex-shrink: 0;
    margin-top: 0.125rem;
    color: var(--color-text-tertiary);
  }
  .note-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }
</style>

<ConfirmModal
  title="Unseed"
  width="26rem"
  icon={clean ? "trash" : "seed"}
  label="Unseed"
  busyLabel="Unseeding…"
  failure="Unable to unseed."
  confirm={() => confirm(clean)}>
  {#snippet body({ working })}
    <div class="repo txt-overflow">
      <span class="repo-icon"><Icon name="repository" /></span>
      {name}
    </div>
    <span class="rid">{rid}</span>

    <div class="note txt-body-m-regular">
      <span class="note-icon"><Icon name="seed" /></span>
      <div class="note-body">
        <span>
          Your node stops replicating and announcing this repository{repoListScope.value ===
          "seeded"
            ? ", and it leaves the sidebar."
            : "; the sidebar dims it."}
          {#if !clean}
            The files stay on disk.
          {/if}
        </span>
        <!-- Its own paragraph rather than a swapped-in sentence, so ticking the
               box reads as text appearing instead of a block reflowing. -->
        {#if clean}
          <span>
            The files go too, except the refs your node signed and the
            delegates'. Other nodes have already fetched yours, so replacing
            them later would fork your own history, and the repository can't be
            verified without the delegates'. If you have never published here
            there is nothing signed, and it is deleted outright.
          </span>
        {/if}
        <Checkbox bind:checked={clean} disabled={working}>
          Delete the files from local storage
        </Checkbox>
      </div>
    </div>
  {/snippet}
</ConfirmModal>
