<script lang="ts">
  import { formatOid } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Command from "@app/components/Command.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";

  interface Props {
    patchId: string;
    selectedRevisionId: string;
    tab: "patch" | "revisions" | "timeline";
  }

  const { patchId, selectedRevisionId, tab }: Props = $props();

  const checkoutCommand = $derived.by(() => {
    if (tab === "revisions" && selectedRevisionId !== patchId) {
      return `rad patch checkout ${formatOid(patchId)} --revision ${formatOid(selectedRevisionId)}`;
    } else {
      return `rad patch checkout ${formatOid(patchId)}`;
    }
  });

  let popoverExpanded: boolean = $state(false);
</script>

<Popover placement="bottom-end" bind:expanded={popoverExpanded}>
  {#snippet toggle(onclick)}
    <Button
      variant="naked"
      title="Checkout patch"
      {onclick}
      active={popoverExpanded}>
      <Icon name="checkout" />
      <span class="global-hide-on-medium-desktop-down">Checkout</span>
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
        To checkout this patch in your working copy, run:
      </span>
      <Command command={checkoutCommand} styleWidth="100%" />
    </div>
  {/snippet}
</Popover>
