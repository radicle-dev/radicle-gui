<script lang="ts">
  import type { ComponentProps } from "svelte";

  import { ariaKeyShortcuts, useShortcuts } from "@app/lib/shortcuts.svelte";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    hasItems?: boolean;
    placeholder: string;
    icon?: ComponentProps<typeof Icon>["name"];
    show: boolean;
    value: string;
    onFocus?: () => void;
    onSubmit?: () => void;
    styleHeight?: "1.75rem" | "2rem" | "2.5rem";
  }

  /* eslint-disable prefer-const */
  let {
    hasItems = true,
    placeholder,
    icon = "search",
    show = $bindable(),
    value = $bindable(),
    onFocus,
    onSubmit,
    styleHeight = "2rem",
  }: Props = $props();
  /* eslint-enable prefer-const */

  let input: TextInput | undefined = $state(undefined);

  useShortcuts({
    shortcut: "filter",
    enabled: () => hasItems,
    active: () => input?.hasFocus() ?? false,
    run: () => {
      show = true;
      // Mounting autofocuses the input, but it may already be open and blurred.
      input?.focus();
    },
  });
</script>

{#if hasItems}
  {#if show}
    <TextInput
      bind:this={input}
      autofocus
      modShortcuts
      {onFocus}
      {onSubmit}
      onBlur={() => {
        if (value === "") {
          show = false;
        }
      }}
      onDismiss={() => {
        value = "";
        show = false;
      }}
      {placeholder}
      {styleHeight}
      keyShortcuts={ariaKeyShortcuts("filter")}
      bind:value>
      {#snippet left()}
        <div
          style:color="var(--color-text-secondary)"
          style:padding-left="0.5rem">
          <Icon name={icon} />
        </div>
      {/snippet}
    </TextInput>
  {:else}
    <div style:display="flex" style:padding="0 1px">
      <Button
        variant="naked"
        {styleHeight}
        keyShortcuts={ariaKeyShortcuts("filter")}
        onclick={() => (show = true)}>
        <Icon name={icon} />
      </Button>
    </div>
  {/if}
{/if}
