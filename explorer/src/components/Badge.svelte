<script lang="ts">
  export let variant:
    | "archived"
    | "background"
    | "delegate"
    | "draft"
    | "foreground"
    | "foreground-emphasized"
    | "merged"
    | "negative"
    | "neutral"
    | "open"
    | "outline"
    | "positive"
    | "private";
  export let round: boolean = false;
  export let style: string | undefined = undefined;
  export let size: "tiny" | "small" | "medium" = "tiny";
  export let title: string | undefined = undefined;
  export let onClick: (() => void) | undefined = undefined;
</script>

<style>
  .badge {
    border-radius: var(--border-radius-sm);
    height: var(--button-tiny-height);
    font: var(--txt-body-s-regular);
    display: flex;
    white-space: nowrap;
    align-items: center;
    gap: 0.25rem;
  }
  .foreground {
    color: var(--color-text-tertiary);
    background: var(--color-surface-mid);
  }
  .foreground-emphasized {
    background-color: var(--color-surface-brand-primary);
    color: var(--color-text-on-brand);
  }
  .background {
    color: var(--color-text-primary);
    background: transparent;
  }
  .delegate {
    color: var(--color-text-merged);
    background: var(--color-surface-merged);
  }
  .neutral {
    color: var(--color-text-primary);
    background: var(--color-surface-mid);
  }
  .positive {
    color: var(--color-text-open);
    background-color: var(--color-feedback-success-bg);
  }
  .private {
    color: var(--color-feedback-warning-text);
    background-color: var(--color-feedback-warning-bg);
  }
  .outline {
    border: 1px solid var(--color-border-subtle);
    background-color: transparent;
  }
  .negative {
    color: var(--color-feedback-error-text);
    background-color: var(--color-feedback-error-bg);
  }
  .draft {
    color: var(--color-text-tertiary);
    background: var(--color-surface-mid);
  }
  .archived {
    color: var(--color-text-archived);
    background: var(--color-surface-archived);
  }
  .open {
    color: var(--color-text-open);
    background: var(--color-surface-open);
  }
  .merged {
    color: var(--color-text-merged);
    background: var(--color-surface-merged);
  }
  .tiny {
    height: 1.5rem;
    font: var(--txt-body-s-regular);
    padding: 0.25rem 0.5rem;
  }
  .small {
    height: 2rem;
    font: var(--txt-body-m-regular);
    padding: 0.5rem 0.75rem;
  }
  .medium {
    height: 2.5rem;
    font: var(--txt-body-m-regular);
    padding: 0.75rem 1rem;
  }
  .round {
    aspect-ratio: 1/1;
    justify-content: center;
    padding: unset;
  }
</style>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<span
  role="button"
  tabindex="0"
  class="badge"
  onclick={onClick}
  {style}
  {title}
  class:round
  class:tiny={size === "tiny"}
  class:small={size === "small"}
  class:medium={size === "medium"}
  class:private={variant === "private"}
  class:delegate={variant === "delegate"}
  class:outline={variant === "outline"}
  class:foreground-emphasized={variant === "foreground-emphasized"}
  class:foreground={variant === "foreground"}
  class:neutral={variant === "neutral"}
  class:negative={variant === "negative"}
  class:positive={variant === "positive"}
  class:draft={variant === "draft"}
  class:archived={variant === "archived"}
  class:open={variant === "open"}
  class:merged={variant === "merged"}
  class:background={variant === "background"}>
  <slot />
</span>
