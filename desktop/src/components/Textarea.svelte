<script lang="ts">
  import type {
    ClipboardEventHandler,
    FormEventHandler,
  } from "svelte/elements";

  import { onMount, tick } from "svelte";

  import type { MarkdownFormat, TextEdit } from "@app/lib/markdownFormat";
  import {
    applyMarkdownFormat,
    applyTextEdit,
    pasteLinkEdit,
  } from "@app/lib/markdownFormat";
  import { matchesShortcut } from "@app/lib/shortcuts.svelte";

  interface Props {
    draggingOver?: boolean;
    borderVariant?: "float" | "ghost";
    element?: HTMLTextAreaElement;
    onpaste?: ClipboardEventHandler<HTMLTextAreaElement>;
    focus?: boolean;
    oninput?: FormEventHandler<HTMLTextAreaElement>;
    interceptKeydown?: (event: KeyboardEvent) => boolean;
    onkeypress?: FormEventHandler<HTMLTextAreaElement>;
    placeholder?: string;
    selectionEnd?: number;
    selectionStart?: number;
    size?: "grow" | "resizable" | "fixed-height";
    styleMinHeight?: string;
    styleAlignItems?: string;
    stylePadding?: string;
    submit: () => Promise<void>;
    value?: string;
  }

  /* eslint-disable prefer-const */
  let {
    draggingOver,
    borderVariant = "float",
    element = $bindable(undefined),
    focus = false,
    onpaste,
    oninput,
    interceptKeydown,
    onkeypress,
    placeholder = undefined,
    // Defaulting selectionStart and selectionEnd to 0, since no full support yet.
    selectionEnd = $bindable(0),
    selectionStart = $bindable(0),
    size = "grow",
    styleAlignItems = undefined,
    styleMinHeight = undefined,
    stylePadding = "0.75rem",
    submit,
    value = $bindable(undefined),
  }: Props = $props();
  /* eslint-enable prefer-const */

  const borderColors: Record<NonNullable<Props["borderVariant"]>, string> = {
    ghost: "var(--color-border-subtle)",
    float: "var(--color-border-subtle)",
  };

  let focussed = $state(false);

  onMount(() => {
    if (element) {
      element.addEventListener("keydown", handleKeydown);
      element.addEventListener("selectionchange", (event: Event) => {
        if (
          event.target &&
          "selectionStart" in event.target &&
          "selectionEnd" in event.target
        ) {
          selectionStart = event.target.selectionStart as number;
          selectionEnd = event.target.selectionEnd as number;
        }
      });
    }
  });

  // We either auto-grow the textarea, or allow the user to resize it. These
  // options are mutually exclusive because a user resized textarea would
  // automatically shrink upon text input otherwise.
  $effect(() => {
    if (element && size === "grow") {
      // React to changes to the textarea content.
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      value;

      // Reset height to 0px on every value change so that the textarea
      // immediately shrinks when all text is deleted.
      element.style.height = `0px`;
      element.style.height = `${element.scrollHeight}px`;
    }
  });

  $effect(() => {
    if (element && focus) {
      element.focus();
      focus = false;
    }
  });

  $effect(() => {
    void tick().then(() => {
      if (element && focus) {
        element.setSelectionRange(selectionStart, selectionEnd);
        element.focus();
      }
    });
  });

  const formats: MarkdownFormat[] = ["bold", "italic", "code", "link"];

  // `insertText` keeps the edit on the native undo stack; assigning is a fallback.
  function applyEdit(element: HTMLTextAreaElement, edit: TextEdit) {
    element.setSelectionRange(edit.from, edit.to);
    const applied = edit.text
      ? document.execCommand("insertText", false, edit.text)
      : document.execCommand("delete");
    if (!applied) {
      value = applyTextEdit(element.value, edit);
    }

    selectionStart = edit.selectionStart;
    selectionEnd = edit.selectionEnd;
    void tick().then(() =>
      element.setSelectionRange(edit.selectionStart, edit.selectionEnd),
    );
  }

  function handlePaste(
    event: ClipboardEvent & {
      currentTarget: EventTarget & HTMLTextAreaElement;
    },
  ) {
    void onpaste?.(event);
    if (event.defaultPrevented) {
      return;
    }

    const element = event.currentTarget;
    const edit = pasteLinkEdit(
      element.value,
      element.selectionStart,
      element.selectionEnd,
      event.clipboardData?.getData("text/plain") ?? "",
    );
    if (edit) {
      event.preventDefault();
      applyEdit(element, edit);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (interceptKeydown?.(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (matchesShortcut(event, "submit")) {
      void submit();
    }
    if (event.key === "Escape") {
      element?.blur();
    }
    if (event.key === "Enter") {
      selectionStart += 1;
      selectionEnd += 1;
    }

    const format = formats.find(f => matchesShortcut(event, f));
    if (format && element) {
      event.preventDefault();
      applyEdit(
        element,
        applyMarkdownFormat(
          format,
          element.value,
          element.selectionStart,
          element.selectionEnd,
        ),
      );
    }
  }
</script>

<style>
  textarea {
    background-color: transparent;
    border: 0;
    color: var(--color-text-secondary);
    font-family: inherit;
    height: 100%;
    width: 100%;
    min-height: 6.375rem;
    resize: none;
    overflow: hidden;
    outline: none;
    line-height: 1rem;
  }

  textarea::-webkit-scrollbar-corner {
    background-color: transparent;
  }

  textarea::-webkit-resizer {
    background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAMAAAAolt3jAAAAAXNSR0IB2cksfwAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAD9QTFRFAAAAZWZmZmZmZmVmZWVmwsLBwsLCZ2ZmwsPCZmdlZWZnwcLBZmZkYGJjw8LDwsPBZmZnZWZkZ2ZkwMDBWFtcNbXb2AAAABV0Uk5TAP///////////////////////1H/YDRrSAAAAFBJREFUeJxVjUESgCAMA2mqAoqK6P/f6kzjIXIos5NumpI8g5LbpJnNQvDl52mWUYTquqnXwstshpHaTi+o+hHXccoKmHVW9yvIxv218ntivmOYAWpLfqaRAAAAAElFTkSuQmCC);
    background-size: 7px;
    background-repeat: no-repeat;
    background-position: bottom 1px right 1px;
  }

  textarea::placeholder {
    color: var(--color-text-secondary);
  }

  textarea::-webkit-scrollbar {
    width: 7px;
    height: 7px;
  }

  textarea::-webkit-scrollbar-track {
    background-color: transparent;
  }

  textarea::-webkit-scrollbar-thumb {
    background-color: var(--color-surface-subtle);
    border-radius: var(--border-radius-md);
  }

  .dragover {
    position: absolute;
    opacity: 0.5;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
    background-color: var(--color-surface-canvas);
  }
</style>

<div
  style:border={`1px solid ${focussed ? "var(--color-border-brand)" : borderColors[borderVariant]}`}
  style:border-radius="var(--border-radius-sm)"
  style:display="flex"
  style:gap="0.5rem"
  style:align-items={styleAlignItems}
  style:background-color="var(--color-surface-base)"
  style:position="relative"
  style:width="100%"
  style:min-height={styleMinHeight}>
  <textarea
    style:min-height={styleMinHeight}
    style:padding={stylePadding}
    tabindex="0"
    bind:this={element}
    bind:value
    aria-label="textarea-comment"
    class="txt-body-m-regular"
    style:resize={size === "resizable" ? "vertical" : undefined}
    style:overflow={size === "resizable" || size === "fixed-height"
      ? "scroll"
      : undefined}
    {placeholder}
    onpaste={handlePaste}
    {oninput}
    {onkeypress}
    onfocus={() => (focussed = true)}
    onblur={() => (focussed = false)}>
  </textarea>
  {#if draggingOver}
    <div class="txt-body-m-regular dragover">
      Drop files to add them as embeds. Embeds are limited to 10MB.
    </div>
  {/if}
</div>
