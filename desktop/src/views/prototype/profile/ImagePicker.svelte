<script lang="ts">
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import TextInput from "@app/components/TextInput.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  import {
    addRepoImage,
    imageSource,
    isExternal,
    removeRepoImage,
  } from "./store.svelte";

  interface Props {
    label: string;
    description: string;
    // A square avatar and a wide banner need different previews.
    shape?: "square" | "wide";
    // When set, an empty field falls back to the pattern generated from this
    // key rather than an empty box, because that is what people actually see.
    fallbackNodeId?: string;
    value: string;
  }

  /* eslint-disable prefer-const */
  let {
    label,
    description,
    shape = "square",
    fallbackNodeId = undefined,
    value = $bindable(""),
  }: Props = $props();
  /* eslint-enable prefer-const */

  // Idle shows what is set; "url" is the transient state for typing one in.
  type Mode = "idle" | "url";

  let mode = $state<Mode>("idle");
  let urlDraft = $state("");

  const preview = $derived(imageSource(value));
  const external = $derived(isExternal(value));

  let broken = $state(false);
  $effect(() => {
    void preview;
    broken = false;
  });

  // Whatever this field pointed at is no longer referenced, so it goes.
  function releaseCurrent() {
    if (value && !isExternal(value)) removeRepoImage(value);
  }

  // Simulates the file dialog: in the real thing this copies the chosen file
  // into the actor repository, replacing whatever was there.
  function choose() {
    releaseCurrent();
    value = addRepoImage().path;
    mode = "idle";
  }

  function clear() {
    releaseCurrent();
    value = "";
  }

  function startUrl() {
    urlDraft = external ? value : "";
    mode = "url";
  }

  function commitUrl() {
    releaseCurrent();
    value = urlDraft.trim();
    mode = "idle";
  }
</script>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .label {
    color: var(--color-text-primary);
  }
  .description {
    color: var(--color-text-secondary);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.875rem;
  }
  .preview {
    position: relative;
    flex-shrink: 0;
    padding: 0;
    cursor: pointer;
    overflow: hidden;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
  }
  .preview.square {
    width: 4rem;
    height: 4rem;
  }
  .preview.wide {
    width: 12rem;
    height: 4rem;
  }
  .preview img,
  .preview :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .preview:hover {
    border-color: var(--color-border-mid);
  }
  /* Sits on the image, so the picker has no button of its own. Centred and
     filled, since a corner glyph vanished into whatever it sat on. */
  .pick {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-mid);
    color: var(--color-text-primary);
  }
  .preview:hover .pick {
    background-color: var(--color-surface-strong);
  }
  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--color-text-quaternary);
  }
  .details {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .source {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
  }
  .source-value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-primary);
    font: var(--txt-code-regular);
  }
  .source-kind {
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .or {
    color: var(--color-text-tertiary);
  }
  /* The picker is the primary way in, so this sits back from it. */
  .actions :global(.button.outline) {
    color: var(--color-text-secondary);
  }
  .url-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .url-row > :global(:first-child) {
    flex: 1;
    min-width: 0;
  }
  .warning {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-feedback-warning-text);
  }
</style>

<div class="field">
  <span class="label txt-body-m-medium">{label}</span>
  <span class="description txt-body-m-regular">{description}</span>

  <div class="row">
    <button
      type="button"
      class="preview {shape}"
      title={value
        ? `Replace ${label.toLowerCase()}`
        : `Choose ${label.toLowerCase()}`}
      onclick={choose}>
      {#if preview && !broken}
        <img src={preview} alt="" onerror={() => (broken = true)} />
      {:else if fallbackNodeId}
        <UserAvatar nodeId={fallbackNodeId} styleWidth="100%" />
      {:else}
        <span class="placeholder"><Icon name="placeholder" /></span>
      {/if}
      <span class="pick"><Icon name={value ? "edit" : "plus"} /></span>
    </button>

    <div class="details">
      {#if mode === "url"}
        <div class="url-row">
          <TextInput
            bind:value={urlDraft}
            autofocus
            placeholder="https://example.com/me.png"
            onSubmit={commitUrl} />
          <Button variant="secondary" onclick={commitUrl}>Use</Button>
          <Button variant="outline" bordered onclick={() => (mode = "idle")}>
            Cancel
          </Button>
        </div>
      {:else if value}
        <div class="source">
          <span class="source-value">{value}</span>
          <span class="source-kind txt-body-m-regular">
            {external ? "external" : "in your repository"}
          </span>
        </div>
        <div class="actions">
          <span class="or txt-body-m-regular">or</span>
          <Button variant="outline" bordered onclick={startUrl}>
            Use a URL
          </Button>
          <Button variant="naked" onclick={clear}>Remove</Button>
        </div>
      {:else}
        <div class="actions">
          <span class="or txt-body-m-regular">or</span>
          <Button variant="outline" bordered onclick={startUrl}>
            Use a URL
          </Button>
        </div>
      {/if}

      {#if mode === "idle" && external}
        <span class="warning txt-body-s-regular">
          <Icon name="warning" />
          Fetched through the proxy and not replicated with your repository.
        </span>
      {/if}
    </div>
  </div>
</div>
