<script lang="ts">
  import type { ComponentProps } from "svelte";

  import { saveToDisk, writeToClipboard } from "@app/lib/invoke";

  import Button from "@app/components/Button.svelte";
  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";

  interface Props {
    // A thunk so the diff text isn't generated until an action runs.
    text: () => Promise<string>;
    fileName: string;
    title?: string;
  }

  const { text, fileName, title = "Diff actions" }: Props = $props();

  let expanded = $state(false);

  type Action = {
    label: string;
    icon: ComponentProps<typeof Icon>["name"];
    run: () => Promise<void>;
  };

  const actions: Action[] = [
    {
      label: "Copy to clipboard",
      icon: "copy",
      run: async () => writeToClipboard(await text()),
    },
    {
      label: "Save to disk",
      icon: "download",
      run: async () => saveToDisk(fileName, await text()),
    },
  ];

  async function run(action: Action) {
    closeFocused();
    try {
      await action.run();
    } catch (e) {
      console.error(`${action.label} failed`, e);
    }
  }
</script>

<Popover placement="bottom-end" bind:expanded>
  {#snippet toggle(onclick)}
    <Button
      variant="naked"
      active={expanded}
      {title}
      {onclick}
      styleHeight="1.75rem"
      styleWidth="1.75rem"
      stylePadding="0"
      styleJustifyContent="center">
      <Icon name="ellipsis-vertical" />
    </Button>
  {/snippet}

  {#snippet popover()}
    <div
      style:border="1px solid var(--color-border-subtle)"
      style:border-radius="var(--border-radius-md)"
      style:background-color="var(--color-surface-canvas)"
      style:padding="0.25rem">
      <DropdownList items={actions}>
        {#snippet item(action)}
          <DropdownListItem
            selected={false}
            styleGap="0.5rem"
            onclick={() => run(action)}>
            <Icon name={action.icon} />
            {action.label}
          </DropdownListItem>
        {/snippet}
      </DropdownList>
    </div>
  {/snippet}
</Popover>
