<script lang="ts">
  export let ariaLabel: string | undefined = undefined;
  export let title: string | undefined = undefined;
  export let variant:
    | "background"
    | "not-selected"
    | "gray"
    | "gray-white"
    | "selected"
    | "outline"
    | "foreground"
    | "secondary"
    | "secondary-toggle-off"
    | "secondary-mobile"
    | "secondary-mobile-toggle"
    | "tab"
    | "tab-active" = "gray";
  export let size: "small" | "regular" | "large" = "regular";

  export let autofocus: boolean = false;
  export let disabled: boolean = false;
  export let notAllowed: boolean = true;

  export let styleFontFamily: string | undefined = undefined;
  export let stylePadding: string | undefined = undefined;
  export let styleWidth: "100%" | undefined = undefined;
  export let styleMinWidth: string | undefined = undefined;
  export let styleBorderRadius: string | undefined = undefined;
  export let styleJustifyContent: "center" | "flex-start" = "center";

  let hover: boolean = false;
</script>

<style>
  button {
    position: relative;
    cursor: pointer;
    display: flex;
    align-items: center;
    border: 1px solid transparent;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-semibold);
    font-feature-settings: inherit;
    white-space: nowrap;
    gap: 0.5rem;
    touch-action: manipulation;
    box-sizing: border-box;
  }

  button:disabled {
    color: var(--color-text-disabled);
  }
  button:disabled.not-allowed {
    cursor: not-allowed;
  }

  .small {
    height: var(--button-tiny-height);
    padding: 0 0.6rem;
  }

  .regular {
    height: var(--button-small-height);
    padding: 0 0.75rem;
  }

  .large {
    border-radius: var(--border-radius-sm);
    height: var(--button-regular-height);
    padding: 0 1rem;
  }

  .background {
    color: var(--color-text-primary);
    background-color: var(--color-surface-base);
    font: var(--txt-body-m-regular);
  }
  .background[disabled] {
    color: var(--color-text-disabled);
    background-color: var(--color-surface-base);
  }
  .background:not([disabled]):hover {
    color: var(--color-text-primary);
    background-color: var(--color-surface-mid);
  }

  .gray {
    background-color: var(--color-surface-mid);
    color: var(--color-text-primary);
  }
  .gray[disabled] {
    background-color: var(--color-surface-mid);
    color: var(--color-text-disabled);
  }
  .gray:not([disabled]):hover {
    background-color: var(--color-surface-strong);
    color: var(--color-text-primary);
  }

  .gray-white {
    background-color: var(--color-surface-mid);
    color: var(--color-text-primary);
  }
  .gray-white[disabled] {
    background-color: var(--color-surface-mid);
    color: var(--color-text-disabled);
  }
  .gray-white:not([disabled]):hover {
    background-color: var(--color-surface-strong);
    color: var(--color-text-primary);
  }
  .selected {
    background-color: var(--color-surface-mid);
    color: var(--color-text-primary);
    cursor: default;
  }
  .selected[disabled] {
    background-color: var(--color-surface-mid);
    color: var(--color-text-disabled);
  }

  .not-selected {
    background-color: transparent;
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-regular);
    letter-spacing: 0.02rem;
  }
  .not-selected[disabled] {
    background-color: transparent;
    color: var(--color-text-disabled);
    border: 1px solid var(--color-border-subtle);
  }
  .not-selected:not([disabled]):hover {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-mid);
  }

  .outline {
    background-color: transparent;
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-subtle);
  }
  .outline[disabled] {
    background-color: transparent;
    color: var(--color-text-tertiary);
  }
  .outline:not([disabled]):hover {
    background-color: var(--color-surface-subtle);
    border: 1px solid var(--color-border-mid);
  }

  .secondary-toggle-off {
    background-color: var(--color-surface-brand-primary);
    color: var(--color-text-on-brand);
  }
  .secondary-toggle-off[disabled] {
    background-color: var(--color-surface-mid);
    color: var(--color-text-disabled);
  }
  .secondary-toggle-off:not([disabled]):hover {
    background-color: var(--color-surface-brand-secondary);
  }

  .foreground {
    color: var(--color-surface-base);
    background-color: var(--color-text-primary);
  }

  .foreground[disabled] {
    background-color: var(--color-surface-mid);
    color: var(--color-text-disabled);
  }

  .foreground:not([disabled]):hover {
    opacity: 0.9;
  }

  .secondary {
    color: var(--color-text-on-brand);
    background-color: var(--color-surface-brand-primary);
  }

  .secondary[disabled] {
    background-color: var(--color-surface-mid);
    color: var(--color-text-disabled);
  }

  .secondary:not([disabled]):hover {
    background-color: var(--color-surface-brand-secondary);
  }

  .secondary-mobile {
    color: var(--color-text-tertiary);
    background-color: var(--color-surface-base);
  }

  .secondary-mobile[disabled] {
    background-color: var(--color-surface-mid);
    color: var(--color-text-disabled);
  }

  .secondary-mobile:not([disabled]):active {
    color: var(--color-text-on-brand);
    background-color: var(--color-surface-brand-primary);
  }

  .secondary-mobile-toggle {
    color: var(--color-text-tertiary);
    background-color: var(--color-surface-base);
  }

  .secondary-mobile-toggle[disabled] {
    background-color: var(--color-surface-mid);
    color: var(--color-text-disabled);
  }

  .tab {
    background-color: transparent;
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md) var(--border-radius-md) 0 0;
    font-weight: normal;
    letter-spacing: 0.3px;
  }

  .tab[disabled] {
    background-color: var(--color-surface-base);
    color: var(--color-text-disabled);
    border: none;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .tab:not([disabled]):hover {
    background-color: var(--color-surface-subtle);
    border-color: var(--color-border-mid);
  }

  .tab-active {
    background-color: var(--color-surface-base);
    border: 1px solid var(--color-border-subtle);
    border-bottom: 1px solid var(--color-surface-base);
    border-radius: var(--border-radius-md) var(--border-radius-md) 0 0;
    color: var(--color-text-primary);
  }

  .tab-active[disabled] {
    background-color: var(--color-surface-base);
    color: var(--color-text-disabled);
  }
</style>

<!-- svelte-ignore a11y-autofocus -->
<button
  aria-label={ariaLabel}
  {autofocus}
  {disabled}
  {title}
  tabindex="0"
  style:font-family={styleFontFamily}
  style:padding={stylePadding}
  style:width={styleWidth}
  style:min-width={styleMinWidth}
  style:border-radius={styleBorderRadius}
  style:justify-content={styleJustifyContent}
  on:blur
  on:click
  on:focus
  on:mouseout
  on:mouseover
  on:mouseenter={() => {
    hover = true;
  }}
  on:mouseleave={() => {
    hover = false;
  }}
  class:disabled
  class:not-allowed={notAllowed}
  class:small={size === "small"}
  class:regular={size === "regular"}
  class:large={size === "large"}
  class:background={variant === "background"}
  class:not-selected={variant === "not-selected"}
  class:gray-white={variant === "gray-white"}
  class:selected={variant === "selected"}
  class:gray={variant === "gray"}
  class:outline={variant === "outline"}
  class:foreground={variant === "foreground"}
  class:secondary-toggle-off={variant === "secondary-toggle-off"}
  class:secondary={variant === "secondary"}
  class:secondary-mobile={variant === "secondary-mobile"}
  class:secondary-mobile-toggle={variant === "secondary-mobile-toggle"}
  class:tab={variant === "tab"}
  class:tab-active={variant === "tab-active"}>
  <slot {hover} />
</button>
