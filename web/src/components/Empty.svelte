<script lang="ts">
  import type { ComponentProps, Snippet } from "svelte";

  import Icon from "./Icon.svelte";

  interface Props {
    icon: ComponentProps<typeof Icon>["name"];
    title: string;
    children?: Snippet;
  }

  const { icon, title, children }: Props = $props();
</script>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.5rem;
    padding: 3rem 1rem;
    color: var(--color-text-tertiary);
  }
  .title {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
  }
</style>

<div class="empty">
  <Icon name={icon} size="32" />
  <div class="title">{title}</div>
  {#if children}<div class="txt-body-m-regular">{@render children()}</div>{/if}
</div>
