<script lang="ts">
  import Button from "@app/components/Button.svelte";
  import Command from "@app/components/Command.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";

  export let id: string;
</script>

<style>
  .label {
    display: block;
    font: var(--txt-body-m-regular);
    margin-bottom: 0.75rem;
  }
</style>

<Popover popoverPositionTop="2.5rem" popoverPositionRight="0">
  <Button
    slot="toggle"
    let:toggle
    variant="secondary-toggle-off"
    on:click={() => {
      toggle();
    }}>
    <Icon name="checkout" />
    <span class="global-hide-on-small-desktop-down">Checkout</span>
  </Button>

  <div slot="popover" style:width="20rem">
    <span class="label">
      Run this command from a Radicle working copy to checkout this patch.
    </span>
    <Command command={`rad patch checkout ${id}`} />
  </div>
</Popover>
