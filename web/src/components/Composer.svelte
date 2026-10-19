<script lang="ts">
  import { modKey } from "@app/lib/shortcuts.svelte";

  import Avatar from "./Avatar.svelte";
  import Button from "./Button.svelte";
  import Markdown from "./Markdown.svelte";

  interface Props {
    placeholder?: string;
    submitLabel?: string;
    onSubmit: (body: string) => void;
    onCancel?: () => void;
    autofocus?: boolean;
    compact?: boolean;
    extra?: import("svelte").Snippet;
  }

  const {
    placeholder = "Leave a comment",
    submitLabel = "Comment",
    onSubmit,
    onCancel,
    autofocus = false,
    compact = false,
    extra,
  }: Props = $props();

  let body = $state("");
  let preview = $state(false);
  let textarea: HTMLTextAreaElement | undefined = $state();

  $effect(() => {
    if (autofocus) textarea?.focus();
  });

  function submit() {
    if (!body.trim()) return;
    onSubmit(body.trim());
    body = "";
    preview = false;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape" && onCancel) {
      onCancel();
    }
  }
</script>

<style>
  .composer {
    display: flex;
    gap: 0.75rem;
  }
  .box {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0.375rem 0.5rem 0;
    border-bottom: 1px solid var(--color-border-subtle);
    background: var(--color-surface-base);
  }
  .tabs button {
    all: unset;
    cursor: pointer;
    font: var(--txt-body-s-medium);
    padding: 0.25rem 0.5rem 0.375rem;
    color: var(--color-text-tertiary);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }
  .tabs button.active {
    color: var(--color-text-primary);
    border-color: var(--color-text-primary);
  }
  textarea {
    border: none;
    border-radius: 0;
    min-height: 5.5rem;
  }
  .compact textarea {
    min-height: 3.5rem;
  }
  .preview {
    padding: 0.75rem;
    min-height: 3.5rem;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.5rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .hint {
    margin-right: auto;
    font: var(--txt-body-s-regular);
    color: var(--color-text-quaternary);
  }
</style>

<div class="composer" class:compact>
  {#if !compact}<Avatar person="self" size="1.75rem" />{/if}
  <div class="box card">
    <div class="tabs">
      <button class:active={!preview} onclick={() => (preview = false)}>Write</button>
      <button class:active={preview} onclick={() => (preview = true)}>Preview</button>
    </div>
    {#if preview}
      <div class="preview">
        {#if body.trim()}<Markdown content={body} compact />{:else}<span class="muted">Nothing to preview</span>{/if}
      </div>
    {:else}
      <textarea bind:this={textarea} class="textarea" bind:value={body} {placeholder} {onkeydown}></textarea>
    {/if}
    <div class="foot">
      <span class="hint">Markdown supported · {modKey}↵ to send · signed with your key</span>
      {#if extra}{@render extra()}{/if}
      {#if onCancel}<Button variant="naked" onclick={onCancel}>Cancel</Button>{/if}
      <Button variant="secondary" disabled={!body.trim()} onclick={submit}>{submitLabel}</Button>
    </div>
  </div>
</div>
