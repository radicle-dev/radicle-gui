<script lang="ts">
  import type { Snippet } from "svelte";

  type Variant = "secondary" | "ghost" | "naked" | "outline";

  interface Props {
    id?: string;
    children: Snippet;
    variant?: Variant;
    onclick?: (e: MouseEvent) => void;
    disabled?: boolean;
    active?: boolean;
    flatLeft?: boolean;
    flatRight?: boolean;
    bordered?: boolean;
    title?: string;
    ariaLabel?: string;
    styleHeight?: "1.5rem" | "1.75rem" | "2rem" | "2.5rem";
    styleWidth?: string;
    styleJustifyContent?: string;
    stylePadding?: string;
    keyShortcuts?: string;
  }

  const {
    id,
    children,
    variant = "ghost",
    onclick = undefined,
    disabled = false,
    active = false,
    flatLeft = false,
    flatRight = false,
    bordered = false,
    title,
    ariaLabel,
    styleHeight = "2rem",
    styleWidth = undefined,
    styleJustifyContent = undefined,
    stylePadding = "0 0.5rem",
    keyShortcuts,
  }: Props = $props();

  const fills: Record<Variant, string> = {
    secondary: "var(--color-surface-brand-secondary)",
    ghost: "var(--color-surface-subtle)",
    naked: "transparent",
    outline: "transparent",
  };
  const fillsHover: Record<Variant, string> = {
    secondary: "var(--color-surface-brand-secondary)",
    ghost: "var(--color-surface-mid)",
    naked: "var(--color-surface-subtle)",
    outline: "var(--color-surface-subtle)",
  };
  const fillsActive: Record<Variant, string> = {
    secondary: "var(--color-surface-brand-primary)",
    ghost: "var(--color-surface-strong)",
    naked: "var(--color-surface-strong)",
    outline: "var(--color-surface-strong)",
  };
  const colors: Record<Variant, string> = {
    secondary: "var(--color-text-on-brand)",
    ghost: "var(--color-text-primary)",
    naked: "inherit",
    outline: "inherit",
  };
  const colorsHover: Record<Variant, string> = {
    secondary: "var(--color-text-on-brand)",
    ghost: "var(--color-text-primary)",
    naked: "inherit",
    outline: "var(--color-text-primary)",
  };
  const colorsActive: Record<Variant, string> = {
    secondary: "var(--color-text-on-brand)",
    ghost: "var(--color-text-primary)",
    naked: "inherit",
    outline: "var(--color-text-primary)",
  };
</script>

<style>
  .button {
    white-space: nowrap;

    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;

    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: var(--border-radius-sm);
    border: none;
    background-color: var(--color-fill);
    color: var(--color-text);
    transition: background-color 0.1s ease;
  }

  .button:hover:not(.disabled) {
    background-color: var(--color-fill-hover);
    color: var(--color-text-hover);
  }

  .button.active:not(.disabled),
  .button:active:not(.disabled) {
    background-color: var(--color-fill-active);
    color: var(--color-text-active);
  }

  .button.disabled {
    cursor: default;
    color: var(--color-text-disabled);
  }

  .button.secondary.disabled,
  .button.ghost.disabled {
    background-color: var(--color-surface-subtle);
  }

  .button.naked.disabled {
    cursor: inherit;
  }

  .button.outline {
    border: 1px solid var(--color-border-subtle);
  }

  .button.outline:hover:not(.disabled) {
    border-color: var(--color-border-mid);
  }
  .button.bordered {
    border: 1px solid var(--color-border-subtle);
    background-color: var(--color-surface-canvas);
  }
  .button.bordered:hover:not(.disabled) {
    background-color: var(--color-surface-subtle);
  }

  .button.outline.active:not(.disabled),
  .button.outline:active:not(.disabled) {
    border-color: var(--color-border-mid);
  }

  .button.outline.disabled {
    border-color: var(--color-border-subtle);
  }

  .button.flat-left {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  .button.flat-right {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
</style>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  {id}
  class="button txt-body-m-medium"
  class:secondary={variant === "secondary"}
  class:ghost={variant === "ghost"}
  class:naked={variant === "naked"}
  class:outline={variant === "outline"}
  class:bordered
  class:disabled
  class:active
  class:flat-left={flatLeft}
  class:flat-right={flatRight}
  style:cursor={disabled
    ? variant === "naked"
      ? "inherit"
      : "default"
    : "pointer"}
  style:height={styleHeight}
  style:width={styleWidth}
  style:padding={stylePadding}
  style:justify-content={styleJustifyContent ??
    (styleWidth ? "center" : undefined)}
  style:--color-fill={fills[variant]}
  style:--color-fill-hover={fillsHover[variant]}
  style:--color-fill-active={fillsActive[variant]}
  style:--color-text={colors[variant]}
  style:--color-text-hover={colorsHover[variant]}
  style:--color-text-active={colorsActive[variant]}
  aria-label={ariaLabel}
  aria-keyshortcuts={keyShortcuts}
  aria-disabled={disabled || undefined}
  onclick={!disabled ? onclick : undefined}
  role="button"
  tabindex="0"
  {title}>
  {@render children()}
</div>
