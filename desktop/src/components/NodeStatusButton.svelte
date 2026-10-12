<script lang="ts">
  import { nodeRunning } from "@app/lib/events";

  import Button from "@app/components/Button.svelte";
  import Command from "@app/components/Command.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";

  let popoverExpanded: boolean = $state(false);
</script>

<Popover
  popoverPadding="0"
  placement="top-start"
  bind:expanded={popoverExpanded}>
  {#snippet toggle(onclick)}
    <Button
      variant="naked"
      {onclick}
      active={popoverExpanded}
      styleWidth="100%"
      styleJustifyContent="flex-start">
      {#if $nodeRunning}
        <span style:color="var(--color-text-tertiary)">
          <Icon name="online" />
        </span>
        Online
      {:else}
        <span style:color="var(--color-text-tertiary)">
          <Icon name="offline" />
        </span>
        Offline
      {/if}
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
      style:padding="1rem"
      style:width="22rem"
      style:flex-direction="column">
      <div class="txt-body-m-regular" style:line-height="1.625rem">
        {#if $nodeRunning}
          Your node is up and running, your changes will be synced
          automatically.
        {:else}
          Your node is not running, changes you make are safe but won't be
          announced.

          <div style:margin-top="1rem">
            You can start your node with:
            <div style:margin-top="0.5rem">
              <Command styleWidth="fit-content" command="rad node start" />
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/snippet}
</Popover>
