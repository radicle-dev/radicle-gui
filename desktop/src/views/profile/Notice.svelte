<script lang="ts">
  import type { ComponentProps, Snippet } from "svelte";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    icon: ComponentProps<typeof Icon>["name"];
    // With a title, the icon heads the box and the children follow below;
    // without one, the icon sits beside the text.
    title?: string;
    tone?: "error";
    children: Snippet;
  }

  const { icon, title, tone, children }: Props = $props();
</script>

<style>
  .notice {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.75rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .notice.inline {
    flex-direction: row;
    gap: 0.5rem;
  }
  .notice.error {
    border-color: var(--color-feedback-error-border);
    background-color: var(--color-feedback-error-bg);
    color: var(--color-feedback-error-text);
  }
  .heading {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-text-primary);
  }
  .notice.error .heading {
    color: inherit;
  }
  .icon {
    display: flex;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
    padding-top: 0.0625rem;
  }
</style>

<div class="notice" class:inline={!title} class:error={tone === "error"}>
  {#if title}
    <div class="heading txt-body-m-medium">
      <Icon name={icon} />
      {title}
    </div>
  {:else}
    <span class="icon"><Icon name={icon} /></span>
  {/if}

  {@render children()}
</div>
