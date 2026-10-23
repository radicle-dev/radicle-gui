<script lang="ts">
  import { confirmation } from "@app/lib/confirm.svelte";

  import ConfirmDialog from "./ConfirmDialog.svelte";

  let open = $state(false);

  $effect(() => {
    if (confirmation.current) open = true;
  });

  // Closing any other way (Cancel, Escape, the backdrop) declines.
  $effect(() => {
    if (!open && confirmation.current) {
      confirmation.current.resolve(false);
      confirmation.current = undefined;
    }
  });

  function onConfirm() {
    confirmation.current?.resolve(true);
    confirmation.current = undefined;
  }
</script>

{#if confirmation.current}
  <ConfirmDialog
    bind:open
    title={confirmation.current.title}
    confirmLabel={confirmation.current.confirmLabel}
    {onConfirm}>
    {confirmation.current.body}
  </ConfirmDialog>
{/if}
