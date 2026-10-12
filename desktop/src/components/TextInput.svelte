<script lang="ts">
  import type { Snippet } from "svelte";
  import type { FormEventHandler } from "svelte/elements";

  import { onMount } from "svelte";

  import { matchesShortcut } from "@app/lib/shortcuts.svelte";

  interface Props {
    autofocus?: boolean;
    autoselect?: boolean;
    disabled?: boolean;
    keyShortcuts?: string;
    left?: Snippet;
    // Lets shortcuts with Mod through while focused, for fields like filters
    // that hold nothing worth protecting.
    modShortcuts?: boolean;
    name?: string;
    onDismiss?: () => void;
    onFocus?: () => void;
    onBlur?: () => void;
    onKeydown?: (event: KeyboardEvent) => boolean;
    onSubmit?: () => void;
    onModifierSubmit?: () => void;
    oninput?: FormEventHandler<HTMLInputElement>;
    placeholder?: string;
    type?: string;
    valid?: boolean;
    value?: string;
    styleHeight?: string;
  }

  /* eslint-disable prefer-const */
  let {
    autofocus = false,
    autoselect = false,
    disabled = false,
    keyShortcuts,
    left,
    modShortcuts = false,
    name,
    onDismiss,
    onFocus,
    onBlur,
    onKeydown,
    onSubmit,
    onModifierSubmit,
    oninput,
    placeholder,
    type = "text",
    valid = true,
    value = $bindable(undefined),
    styleHeight = "2rem",
  }: Props = $props();
  /* eslint-enable prefer-const */

  let inputElement: HTMLInputElement | undefined = $state(undefined);
  let focussed = $state(false);

  onMount(() => {
    if (inputElement === undefined) {
      return;
    }
    if (autofocus) {
      // Defer focus past the next frame so it survives parent
      // actions (like portal moves) that detach the node on mount.
      requestAnimationFrame(() => {
        inputElement?.focus({ preventScroll: true });
      });
    }
    if (autoselect) {
      inputElement.select();
    }
  });

  export function focus() {
    inputElement?.focus({ preventScroll: true });
  }

  export function hasFocus(): boolean {
    return focussed;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!event.isComposing && onKeydown?.(event)) {
      event.preventDefault();
      return;
    }

    if (matchesShortcut(event, "submit") && onModifierSubmit) {
      event.preventDefault();
      onModifierSubmit();
      return;
    }

    if (event.key === "Enter" && valid && onSubmit) {
      onSubmit();
    }

    if (event.key === "Escape" && onDismiss) {
      inputElement?.blur();
      onDismiss();
    }
  }
</script>

<style>
  input {
    background: transparent;
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    line-height: 1.6;
    outline: none;
    text-overflow: ellipsis;
    width: 100%;
    margin: 0;
    /* The 1px border on each side of the wrapper adds 2px to the total. */
    height: calc(var(--input-height) - 2px);
    border: 0;
  }
  input::placeholder {
    color: var(--color-text-secondary);
    opacity: 1 !important;
  }
  input[disabled] {
    cursor: not-allowed;
  }
</style>

<div
  style:border={`1px solid ${!valid ? "var(--color-feedback-error-border)" : focussed ? "var(--color-border-brand)" : "var(--color-border-subtle)"}`}
  style:border-radius="var(--border-radius-sm)"
  style:display="flex"
  style:gap="0.5rem"
  style:align-items="center"
  style:background-color="var(--color-surface-base)"
  style:width="100%"
  style:--input-height={styleHeight}>
  {@render left?.()}
  <input
    style:padding={left ? "0.25rem 0.75rem 0.25rem 0" : "0.25rem 0.75rem"}
    aria-keyshortcuts={keyShortcuts}
    onfocus={() => {
      if (onFocus) {
        onFocus();
      }
      focussed = true;
    }}
    onblur={() => {
      if (onBlur) {
        onBlur();
      }
      focussed = false;
    }}
    bind:this={inputElement}
    data-mod-shortcuts={modShortcuts || undefined}
    {type}
    {name}
    {placeholder}
    {disabled}
    bind:value
    autocomplete="off"
    spellcheck="false"
    onkeydown={handleKeydown}
    {oninput} />
</div>
