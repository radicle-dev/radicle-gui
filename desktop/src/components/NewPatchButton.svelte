<script lang="ts">
  import Button from "@app/components/Button.svelte";
  import Command from "@app/components/Command.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";

  interface Props {
    outline?: boolean;
    ghost?: boolean;
    rid: string;
  }

  const { outline = false, ghost = false, rid }: Props = $props();

  let popoverExpanded: boolean = $state(false);
</script>

<Popover placement="bottom-end" bind:expanded={popoverExpanded}>
  {#snippet toggle(onclick)}
    {#if outline}
      <Button
        variant="outline"
        styleHeight="2rem"
        {onclick}
        active={popoverExpanded}>
        <Icon name="plus" />
        <span class="global-hide-on-small-desktop-down">New patch</span>
      </Button>
    {:else}
      <Button
        styleHeight="2rem"
        variant={ghost ? "ghost" : "secondary"}
        {onclick}
        active={popoverExpanded}>
        <Icon name="plus" />
        <span class="global-hide-on-small-desktop-down">New patch</span>
      </Button>
    {/if}
  {/snippet}

  {#snippet popover()}
    <div class="txt-body-m-regular">
      <div
        style:border="1px solid var(--color-border-subtle)"
        style:border-radius="var(--border-radius-sm)"
        style:display="flex"
        style:gap="2rem"
        style:align-items="flex-start"
        style:background-color="var(--color-surface-canvas)"
        style:flex-direction="column"
        style:padding="1rem"
        style:width="30rem">
        <div>
          <div class="txt-body-l-semibold" style:margin-bottom="0.5rem">
            Create a new patch
          </div>
          <div
            class="global-flex"
            style:flex-direction="column"
            style:align-items="flex-start"
            style:gap="0.5rem">
            Create a new branch in your working copy, commit your changes, and
            run:
            <Command
              command="git push rad HEAD:refs/patches"
              styleWidth="fit-content" />
          </div>
        </div>

        <div style:margin-bottom="1rem">
          <div class="txt-body-l-semibold" style:margin-bottom="0.5rem">
            Don't have a working copy yet?
          </div>
          <div
            class="global-flex"
            style:flex-direction="column"
            style:align-items="flex-start"
            style:gap="0.5rem">
            To checkout a working copy of this repo, run:
            <Command command={`rad checkout ${rid}`} styleWidth="fit-content" />
          </div>
        </div>
      </div>
    </div>
  {/snippet}
</Popover>
