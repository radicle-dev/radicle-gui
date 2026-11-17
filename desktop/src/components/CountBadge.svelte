<script lang="ts">
  import type { ComponentProps } from "svelte";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    count: number;
    icon: ComponentProps<typeof Icon>["name"];
    title?: string;
  }

  const { count, icon, title }: Props = $props();
</script>

<style>
  .count-badge {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-body-m-regular);
    white-space: nowrap;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    height: 1.5rem;
    padding: 0 0.5rem;
    color: var(--color-text-tertiary);
  }
</style>

<div class="count-badge" {title}>
  <Icon name={icon} />
  {count}
</div>
