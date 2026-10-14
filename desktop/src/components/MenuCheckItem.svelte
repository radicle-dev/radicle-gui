<script lang="ts">
  import type { Snippet } from "svelte";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    checked: boolean;
    label: string;
    title: string;
    onclick: () => void;
    leading?: Snippet;
  }

  const { checked, label, title, onclick, leading }: Props = $props();
</script>

<style>
  .check {
    display: inline-flex;
    width: 1rem;
    flex-shrink: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

<button
  type="button"
  class="menu-item"
  role="menuitemcheckbox"
  aria-checked={checked}
  {title}
  {onclick}>
  <span class="check">
    {#if checked}
      <Icon name="checkmark" />
    {/if}
  </span>
  {@render leading?.()}
  <span class="name">{label}</span>
</button>
