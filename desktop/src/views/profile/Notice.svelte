<script lang="ts">
  import type { ComponentProps, Snippet } from "svelte";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    icon: ComponentProps<typeof Icon>["name"];
    // With a title, the icon heads the box and the children follow below;
    // without one, the icon sits beside the text.
    title?: string;
    tone?: "error" | "warning";
    // Ends the notice with a button the user acknowledges it with.
    ondismiss?: () => void;
    children: Snippet;
  }

  const { icon, title, tone, ondismiss, children }: Props = $props();
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
  .notice.warning {
    border-color: var(--color-feedback-warning-border);
    background-color: var(--color-feedback-warning-bg);
    color: var(--color-text-primary);
  }
  .heading {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-text-primary);
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }
  .dismiss {
    display: flex;
    margin-top: 0.375rem;
  }
  /* The app's filled primary button, in the notice's color. */
  .acknowledge {
    height: 1.75rem;
    padding: 0 0.5rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background-color: var(--tone-fill, var(--color-surface-brand-secondary));
    color: var(--color-text-on-brand);
    cursor: pointer;
  }
  .acknowledge:hover {
    background-color: var(
      --tone-fill-hover,
      var(--color-surface-brand-primary)
    );
  }
  .notice.warning {
    --tone-fill: var(--color-feedback-warning-border);
    --tone-fill-hover: color-mix(
      in srgb,
      var(--color-feedback-warning-border) 85%,
      black
    );
  }
  .notice.error {
    --tone-fill: var(--color-feedback-error-fill);
    --tone-fill-hover: var(--color-feedback-error-fill-hover);
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
  .notice.warning .icon {
    color: inherit;
  }
</style>

<div
  class="notice"
  class:inline={!title}
  class:error={tone === "error"}
  class:warning={tone === "warning"}>
  {#if title}
    <div class="heading txt-body-m-medium">
      <Icon name={icon} />
      {title}
    </div>
  {:else}
    <span class="icon">
      <Icon name={icon} />
    </span>
  {/if}

  <!-- Beside the icon in an inline notice, so the button goes under the
       text rather than next to it. -->
  <div class="content">
    {@render children()}

    {#if ondismiss}
      <div class="dismiss">
        <button class="acknowledge txt-body-m-medium" onclick={ondismiss}>
          I understand
        </button>
      </div>
    {/if}
  </div>
</div>
