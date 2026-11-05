<script lang="ts">
  import { MAX_NAME_LENGTH } from "@app/lib/board";

  import Icon from "@app/components/Icon.svelte";
  import TextInput from "@app/components/TextInput.svelte";
  import ConfirmModal from "@app/modals/ConfirmModal.svelte";

  interface Props {
    title: string;
    repoName: string;
    name: string;
    confirm: (name: string) => Promise<void>;
  }

  const { title, repoName, name: initial, confirm }: Props = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(initial);

  const valid = $derived(
    name.trim().length > 0 && name.trim().length <= MAX_NAME_LENGTH,
  );
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
</style>

<ConfirmModal
  {title}
  width="26rem"
  icon="dashboard"
  label="Create"
  busyLabel="Creating…"
  failure="Unable to create the board."
  disabled={!valid}
  confirm={() => confirm(name.trim())}>
  {#snippet body({ working, run })}
    <div class="repo txt-overflow">
      <span class="repo-icon"><Icon name="repository" /></span>
      {repoName}
    </div>
    <span>
      The board is stored in the repository, so everyone who seeds it gets the
      board and sees where its cards are.
    </span>
    <TextInput
      autofocus
      autoselect
      placeholder="Board name"
      maxlength={MAX_NAME_LENGTH}
      disabled={working}
      onSubmit={run}
      bind:value={name} />
  {/snippet}
</ConfirmModal>
