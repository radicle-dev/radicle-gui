<script lang="ts" generics="T extends string">
  import type { ComponentProps } from "svelte";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";

  interface Props {
    /// Two or more mutually exclusive choices, in the order they are shown. An
    /// option carries either a glyph or a word, not both.
    options: {
      value: T;
      label?: string;
      icon?: ComponentProps<typeof Icon>["name"];
      title?: string;
    }[];
    value: T;
    onchange: (value: T) => void;
  }

  const { options, value, onchange }: Props = $props();
</script>

<style>
  /* The buttons square the edges they share (`flatLeft`/`flatRight`), so the row
     reads as one control with one of its segments on. */
  .switch {
    display: flex;
    align-items: center;
  }
</style>

<div class="switch">
  {#each options as option, index (option.value)}
    <Button
      variant="ghost"
      flatLeft={index > 0}
      flatRight={index < options.length - 1}
      active={value === option.value}
      title={option.title}
      onclick={() => onchange(option.value)}
      styleJustifyContent="center">
      {#if option.icon}
        <Icon name={option.icon} />
      {:else}
        {option.label}
      {/if}
    </Button>
  {/each}
</div>
