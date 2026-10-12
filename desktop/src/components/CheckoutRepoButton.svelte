<script lang="ts">
  import Button from "@app/components/Button.svelte";
  import Command from "@app/components/Command.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";

  interface Props {
    rid: string;
  }

  const { rid }: Props = $props();

  let popoverExpanded: boolean = $state(false);
</script>

<Popover placement="bottom-end" bind:expanded={popoverExpanded}>
  {#snippet toggle(onclick)}
    <Button
      styleHeight="2rem"
      variant="secondary"
      {onclick}
      active={popoverExpanded}>
      <Icon name="checkout" />
      <span class="global-hide-on-medium-desktop-down">Checkout repo</span>
    </Button>
  {/snippet}

  {#snippet popover()}
    <div
      style:border="1px solid var(--color-border-subtle)"
      style:border-radius="var(--border-radius-sm)"
      style:display="flex"
      style:gap="0.5rem"
      style:align-items="flex-start"
      style:background-color="var(--color-surface-canvas)"
      style:flex-direction="column"
      style:padding="1rem"
      style:width="max-content">
      <span class="txt-body-m-regular">
        To checkout a working copy of this repo, run:
      </span>
      <Command command={`rad checkout ${rid}`} styleWidth="100%" />
    </div>
  {/snippet}
</Popover>
