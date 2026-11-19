<script lang="ts" module>
  // A picture chosen for the profile and not saved yet. The backend names
  // the file it is saved as, by what its content is.
  export interface PickedImage {
    base64: string;
    // An object URL to show it by.
    url: string;
  }
</script>

<script lang="ts">
  import UserAvatar from "@radicle-gui/ui/components/UserAvatar.svelte";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";

  interface Props {
    kind: "avatar" | "banner";
    // What the profile field holds: a path in the repository, or a web URL
    // that another tool wrote.
    value: string;
    // The picture to show for it, if there is one to show.
    src: string | undefined;
    picked: PickedImage | undefined;
    // An empty avatar falls back to the pattern generated from this ID,
    // since that is what people see.
    fallbackId?: string;
    disabled: boolean;
    // What the backend would refuse in the field.
    error: string | undefined;
    onpick: (image: PickedImage | undefined) => void;
  }

  /* eslint-disable prefer-const */
  let {
    kind,
    value = $bindable(""),
    src,
    picked,
    fallbackId,
    disabled,
    error,
    onpick,
  }: Props = $props();
  /* eslint-enable prefer-const */

  // The backend's limits, checked here so the answer comes at once. Which
  // kinds of picture it takes is the backend's to say.
  const LIMIT_KIB = { avatar: 1024, banner: 2048 } as const;
  const label = $derived(kind === "avatar" ? "Avatar" : "Banner");

  let input = $state<HTMLInputElement>();
  let pickError = $state<string>();
  let broken = $state(false);

  $effect(() => {
    void src;
    broken = false;
  });

  $effect(() => {
    const url = picked?.url;

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  });

  function base64(bytes: Uint8Array): string {
    let binary = "";
    const step = 0x8000;
    for (let at = 0; at < bytes.length; at += step) {
      binary += String.fromCharCode(...bytes.subarray(at, at + step));
    }

    return btoa(binary);
  }

  async function pick(file: File | undefined) {
    pickError = undefined;
    if (!file) return;

    const kib = Math.ceil(file.size / 1024);
    if (kib > LIMIT_KIB[kind]) {
      pickError = `This picture is ${kib} KiB, and the limit is ${LIMIT_KIB[kind]} KiB.`;
      return;
    }
    // A file that does not decode is no picture, whatever its name says.
    try {
      (await createImageBitmap(file)).close();
    } catch {
      pickError = "This file is not a picture that can be shown.";
      return;
    }

    onpick({
      base64: base64(new Uint8Array(await file.arrayBuffer())),
      url: URL.createObjectURL(file),
    });
  }

  // A picture picked and not saved goes back to what the field held;
  // otherwise the field is emptied.
  function remove() {
    if (picked) onpick(undefined);
    else value = "";
    pickError = undefined;
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
  .preview[disabled] {
    cursor: not-allowed;
  }
  .preview.avatar {
    width: 4rem;
    height: 4rem;
  }
  .preview.banner {
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
  .preview:hover:not([disabled]) {
    border-color: var(--color-border-mid);
  }
  /* Sits on the picture, so the picker has no button of its own. */
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
    background-color: var(--color-surface-canvas);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    color: var(--color-text-primary);
  }
  .preview:hover .pick {
    background-color: var(--color-surface-base);
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
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-primary);
    font: var(--txt-code-regular);
  }
  .unsaved {
    color: var(--color-text-secondary);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .actions :global(.button.outline) {
    color: var(--color-text-secondary);
  }
  .limits {
    color: var(--color-text-tertiary);
  }
  .error {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-feedback-error-text);
  }
  input[type="file"] {
    display: none;
  }
</style>

<div class="field">
  <span class="label txt-body-m-medium">{label}</span>

  <input
    bind:this={input}
    type="file"
    accept="image/png,image/jpeg,image/webp,image/gif"
    aria-label="{kind} picture"
    onchange={() => {
      void pick(input?.files?.[0]);
      if (input) input.value = "";
    }} />

  <div class="row">
    <button
      type="button"
      class="preview {kind}"
      title={disabled ? undefined : src ? `Replace ${kind}` : `Choose ${kind}`}
      {disabled}
      onclick={() => input?.click()}>
      {#if src && !broken}
        <img {src} alt="" onerror={() => (broken = true)} />
      {:else if fallbackId}
        <UserAvatar nodeId={fallbackId} styleWidth="100%" />
      {:else}
        <span class="placeholder"><Icon name="placeholder" /></span>
      {/if}
      {#if !disabled}
        <span class="pick"><Icon name={src ? "edit" : "plus"} /></span>
      {/if}
    </button>

    <div class="details">
      {#if picked || value}
        {#if picked}
          <span class="unsaved txt-body-m-regular">
            New picture, not saved yet
          </span>
        {:else}
          <span class="source">{value}</span>
          {#if value.includes(":")}
            <span class="limits txt-body-s-regular">
              A web address. Desktop does not load pictures from the web.
            </span>
          {/if}
        {/if}
        <!-- A picture that cannot be changed is only shown. -->
        {#if !disabled}
          <div class="actions">
            <Button variant="outline" bordered onclick={remove}>Remove</Button>
          </div>
        {/if}
      {:else if !disabled}
        <span class="limits txt-body-s-regular">
          Up to {LIMIT_KIB[kind] / 1024} MiB.
        </span>
      {/if}
    </div>
  </div>

  {#if pickError ?? error}
    <span class="error txt-body-m-regular">
      <Icon name="warning" />
      {pickError ?? error}
    </span>
  {/if}
</div>
