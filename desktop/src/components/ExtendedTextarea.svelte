<script lang="ts">
  import type { MentionInsertion } from "@app/components/MentionAutocomplete.svelte";
  import type { Embed } from "@bindings/cob/thread/Embed";
  import type { ComponentProps, Snippet } from "svelte";

  import { open } from "@tauri-apps/plugin-dialog";
  import debounce from "lodash/debounce";
  import { SvelteMap } from "svelte/reactivity";

  import { basename, encodeEmbedUpload } from "@app/lib/embeds";
  import { hints } from "@app/lib/hints";
  import { invoke } from "@app/lib/invoke";
  import { matchesShortcut } from "@app/lib/shortcuts.svelte";
  import * as utils from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import MentionAutocomplete from "@app/components/MentionAutocomplete.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import Textarea from "@app/components/Textarea.svelte";

  interface Props {
    textAreaSize?: ComponentProps<typeof Textarea>["size"];
    styleMinHeight?: string;
    rid: string;
    placeholder?: string;
    submitCaption?: string;
    submitVariant?: ComponentProps<typeof Button>["variant"];
    submitActiveVariant?: ComponentProps<typeof Button>["variant"];
    focus?: boolean;
    inline?: boolean;
    body?: string;
    embeds?: Map<string, Embed>;
    submitInProgress?: boolean;
    disableSubmit?: boolean;
    disallowEmptyBody?: boolean;
    emptyBodyTooltip?: string;
    isValid?: () => boolean;
    preview?: boolean;
    stylePadding?: string;
    borderVariant?: ComponentProps<typeof Textarea>["borderVariant"];
    submit: (opts: {
      comment: string;
      embeds: Map<string, Embed>;
    }) => Promise<void>;
    submitDescription?: string;
    secondarySubmit?: {
      caption: string;
      description?: string;
      submit: (opts: {
        comment: string;
        embeds: Map<string, Embed>;
      }) => Promise<void>;
    };
    close: () => void;
    // If true, adding attachments through drag-and-drop is disabled and there
    // is no "Attach" button. If a string is provided, the "Attach" button is
    // visible but disabled and uses the string as the title to indicate the
    // reason for disabling. Defaults to `false`
    disableAttachments?: boolean | string;
    hideDiscard?: boolean;
    // If true, the whole actions row stays hidden until the body has content.
    collapseActions?: boolean;
    // Rendered at the start of the actions row, opposite the buttons.
    leadingActions?: Snippet;
  }

  /* eslint-disable prefer-const */
  let {
    textAreaSize,
    preview = $bindable(false),
    styleMinHeight,
    rid,
    placeholder = "Leave your comment",
    submitCaption = "Comment",
    submitVariant = "ghost",
    submitActiveVariant = undefined,
    focus = false,
    inline = false,
    body = $bindable(""),
    embeds = new SvelteMap<string, Embed>(),
    submitInProgress = false,
    disableSubmit = false,
    disallowEmptyBody = false,
    emptyBodyTooltip,
    isValid = () => true,
    stylePadding,
    borderVariant = "float",
    submit,
    submitDescription,
    secondarySubmit,
    close,
    disableAttachments: attachDisabled = false,
    hideDiscard = false,
    collapseActions = false,
    leadingActions,
  }: Props = $props();
  /* eslint-enable prefer-const */

  const attachEnabled = $derived(attachDisabled === false);
  const attachDisabledReason = $derived(
    typeof attachDisabled === "string" ? attachDisabled : undefined,
  );
  const effectiveSubmitVariant = $derived(
    body.trim().length > 0 && submitActiveVariant !== undefined
      ? submitActiveVariant
      : submitVariant,
  );
  const submitDisabled = $derived(
    !isValid() ||
      submitInProgress ||
      disableSubmit ||
      (disallowEmptyBody && body.trim() === ""),
  );

  let selectionStart = $state(body.length);
  let selectionEnd = $state(body.length);
  let textareaElement: HTMLTextAreaElement | undefined = $state(undefined);
  let interceptMentionKeydown: ((event: KeyboardEvent) => boolean) | undefined =
    $state(undefined);
  let draggingOver = $state(false);
  let embedUploadError: string | undefined = $state();
  let dragDepth = 0;

  // Mirrors `MAX_EMBED_SIZE` in `crates/radicle-types/src/traits/thread.rs`.
  const MAX_EMBED_SIZE = 10_485_760;

  const restoreDragDropText = debounce(() => {
    embedUploadError = undefined;
  }, 5000);

  function splitBody() {
    return [body.substring(0, selectionStart), body.substring(selectionStart)];
  }

  async function uploadEmbeds<T>(
    items: T[],
    nameOf: (item: T) => string,
    save: (item: T) => Promise<string>,
  ) {
    const [preBody, afterBody] = splitBody();
    body =
      preBody +
      items.map(item => `[Uploading ${nameOf(item)}...]()\n`).join("") +
      afterBody;
    const links = await Promise.all(
      items.map(async item => {
        const name = nameOf(item);
        try {
          const oid = await save(item);
          embeds.set(oid, { name, content: `git:${oid}` });
          return `[${name}](${oid})\n`;
        } catch {
          embedUploadError = "Upload failed, embed exceeded 10Mb.";
          restoreDragDropText();
          return "";
        }
      }),
    );
    const inserted = links.join("");
    body = preBody + inserted + afterBody;
    selectionStart = preBody.length + inserted.length;
    selectionEnd = selectionStart;
  }

  function saveByPath(path: string) {
    return invoke<string>("save_embed_by_path", { rid, path });
  }

  function insertMention(insertion: MentionInsertion) {
    const before = body.substring(0, insertion.start);
    const after = body.substring(insertion.end);
    body = before + insertion.markdown + after;
    selectionStart = before.length + insertion.markdown.length;
    selectionEnd = selectionStart;
    textareaElement?.setSelectionRange(selectionStart, selectionEnd);
  }

  async function saveFileBytes(file: File) {
    if (file.size > MAX_EMBED_SIZE) {
      throw new Error(`${file.name} exceeds the embed size limit`);
    }
    return invoke<string>(
      "save_embed_by_bytes",
      encodeEmbedUpload(file.name, new Uint8Array(await file.arrayBuffer())),
      { headers: { rid } },
    );
  }

  function hasFiles(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes("Files") ?? false;
  }

  function acceptsDrop(event: DragEvent): boolean {
    return attachEnabled && !preview && hasFiles(event);
  }

  function handleDragEnter(event: DragEvent) {
    if (!hasFiles(event)) return;
    dragDepth += 1;
    if (acceptsDrop(event)) {
      event.preventDefault();
      draggingOver = true;
    }
  }

  function handleDragOver(event: DragEvent) {
    if (!acceptsDrop(event) || !event.dataTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent) {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      draggingOver = false;
    }
  }

  function handleDrop(event: DragEvent) {
    if (!hasFiles(event)) return;
    dragDepth = 0;
    draggingOver = false;
    if (!acceptsDrop(event) || !event.dataTransfer) return;
    event.preventDefault();
    void uploadEmbeds(
      Array.from(event.dataTransfer.files),
      file => file.name,
      saveFileBytes,
    );
  }

  async function attachEmbedsByPaths(paths: string[]) {
    await uploadEmbeds(paths, basename, saveByPath);
  }

  async function handlePaste(e: ClipboardEvent) {
    if (!attachEnabled) {
      return;
    }

    if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      await uploadEmbeds(
        Array.from(e.clipboardData.files),
        file => file.name,
        saveFileBytes,
      );
    }
  }

  function selectFiles() {
    void open({ multiple: true }).then(paths => {
      if (paths) {
        void attachEmbedsByPaths(paths);
      }
    });
  }

  let activeSubmitIndex = $state<0 | 1>(0);
  let dropdownExpanded = $state(false);

  const activeSubmit = $derived(
    activeSubmitIndex === 1 && secondarySubmit
      ? {
          caption: secondarySubmit.caption,
          submit: secondarySubmit.submit,
        }
      : { caption: submitCaption, submit },
  );

  function submitFn() {
    void activeSubmit
      .submit({ comment: body, embeds })
      .then(() => (preview = false))
      .catch(e => {
        console.error(e);
      });
  }

  export function triggerSubmit() {
    if (submitDisabled) {
      return;
    }
    submitFn();
  }
</script>

<style>
  .comment-section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
    width: 100%;
    flex: 1;
  }
  .inline {
    border: 0;
    padding: 0;
  }
  .actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 100%;
    gap: 1rem;
  }
  .buttons {
    display: flex;
    align-self: flex-start;
    margin-left: auto;
    gap: 0.5rem;
  }
  .shortcut {
    opacity: 0.6;
    margin-left: 0.25rem;
  }
  .split-submit {
    display: flex;
    align-items: stretch;
    gap: 0.25rem;
  }
  .submit-menu {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    width: 22rem;
    overflow: hidden;
  }
  .submit-option {
    display: grid;
    grid-template-columns: 1.5rem 1fr;
    column-gap: 0.5rem;
    align-items: start;
    padding: 0.625rem 0.75rem;
    cursor: pointer;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .submit-option:last-child {
    border-bottom: none;
  }
  .submit-option:hover {
    background-color: var(--color-surface-subtle);
  }
  .submit-check {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 1.25rem;
    color: var(--color-text-primary);
  }
  .submit-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .submit-label {
    font: var(--txt-body-m-medium);
    color: var(--color-text-primary);
  }
  .submit-description {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    white-space: normal;
  }

  .preview {
    width: 100%;
    font: var(--txt-body-m-regular);
    min-height: 109px;
    flex: 1;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    padding: 0.75rem;
  }
  .inline .preview {
    border: 0;
    padding: 0;
    background-color: transparent;
  }
  .textarea-wrap {
    position: relative;
    display: flex;
    width: 100%;
    flex: 1;
  }
  .markdown-hint {
    position: absolute;
    bottom: 0.375rem;
    right: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-text-quaternary);
    opacity: 0.6;
    -webkit-user-select: none;
    user-select: none;
  }
  .markdown-hint-dismiss {
    background: none;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    color: inherit;
    cursor: pointer;
    font: var(--txt-body-s-regular);
    padding: 0 0.375rem;
    line-height: 1.25rem;
  }
  .markdown-hint-dismiss:hover {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
</style>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="comment-section"
  aria-label="extended-textarea"
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  class:inline
  onkeydown={event => {
    if (!preview) return;
    if (matchesShortcut(event, "submit")) {
      event.preventDefault();
      triggerSubmit();
    }
  }}>
  <div class="textarea-wrap">
    {#if preview}
      <div class="preview" style:min-height={styleMinHeight}>
        {#if body.trim().length === 0}
          <span class="txt-missing">Nothing to preview.</span>
        {:else}
          <Markdown {rid} breaks content={body} />
        {/if}
      </div>
    {:else}
      <Textarea
        size={textAreaSize}
        styleAlignItems="flex-start"
        {draggingOver}
        {borderVariant}
        {stylePadding}
        {styleMinHeight}
        bind:element={textareaElement}
        bind:selectionEnd
        bind:selectionStart
        onpaste={handlePaste}
        interceptKeydown={event => interceptMentionKeydown?.(event) ?? false}
        {focus}
        submit={async () => triggerSubmit()}
        bind:value={body}
        {placeholder} />
      <MentionAutocomplete
        {rid}
        textarea={textareaElement}
        value={body}
        caret={selectionStart}
        onselect={insertMention}
        registerKeydown={handler => (interceptMentionKeydown = handler)} />
      {#if !hints.isDismissed("markdown")}
        <div class="markdown-hint txt-body-s-regular">
          <Icon
            name="markdown"
            styleDisplay="inline"
            styleVerticalAlign="text-top" />
          Markdown is supported
          <button
            type="button"
            class="markdown-hint-dismiss"
            title="Don't show again"
            onclick={() => hints.dismiss("markdown")}>
            Hide
          </button>
        </div>
      {/if}
    {/if}
  </div>
  {#if !collapseActions || body.trim() !== ""}
    <div class="actions">
      {@render leadingActions?.()}
      {#if !hideDiscard}
        <Button
          variant="outline"
          disabled={submitInProgress}
          onclick={() => {
            preview = false;
            close();
          }}>
          <Icon name="close" />
          <span class="global-hide-on-small-desktop-down">Discard</span>
        </Button>
      {/if}
      {#if !preview && embedUploadError}
        <div class="txt-overflow txt-body-m-regular">
          <span style:color="var(--color-feedback-error-text)">
            <Icon
              styleDisplay="inline"
              styleVerticalAlign="text-top"
              name="warning" />
            {embedUploadError}
          </span>
        </div>
      {/if}
      <div class="buttons">
        {#if attachEnabled || attachDisabledReason}
          <Button
            variant="outline"
            onclick={selectFiles}
            disabled={preview || attachDisabledReason !== undefined}
            title={attachDisabledReason}>
            <Icon name="attach" />
            Attach
          </Button>
        {/if}
        <Button variant="outline" onclick={() => (preview = !preview)}>
          <Icon name={preview ? "edit" : "eye"} />
          {preview ? "Edit" : "Preview"}
        </Button>
        {#if secondarySubmit}
          <div class="split-submit">
            <Button
              variant={effectiveSubmitVariant}
              title={emptyBodyTooltip}
              disabled={submitDisabled}
              onclick={submitFn}>
              {#if submitInProgress}
                Saving…
              {:else}
                {activeSubmit.caption}
                <span class="shortcut">{utils.modifierKey()}↵</span>
              {/if}
            </Button>
            <Popover
              popoverPadding="0"
              placement="top-end"
              bind:expanded={dropdownExpanded}>
              {#snippet toggle(onclick)}
                <Button
                  variant={effectiveSubmitVariant}
                  disabled={submitInProgress}
                  {onclick}>
                  <Icon
                    name={dropdownExpanded ? "chevron-up" : "chevron-down"} />
                </Button>
              {/snippet}
              {#snippet popover()}
                <div class="submit-menu">
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div
                    role="button"
                    tabindex="0"
                    class="submit-option"
                    onclick={() => {
                      activeSubmitIndex = 0;
                      closeFocused();
                    }}>
                    <div class="submit-check">
                      {#if activeSubmitIndex === 0}
                        <Icon name="checkmark" />
                      {/if}
                    </div>
                    <div class="submit-text">
                      <span class="submit-label">{submitCaption}</span>
                      {#if submitDescription}
                        <span class="submit-description">
                          {submitDescription}
                        </span>
                      {/if}
                    </div>
                  </div>
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div
                    role="button"
                    tabindex="0"
                    class="submit-option"
                    onclick={() => {
                      activeSubmitIndex = 1;
                      closeFocused();
                    }}>
                    <div class="submit-check">
                      {#if activeSubmitIndex === 1}
                        <Icon name="checkmark" />
                      {/if}
                    </div>
                    <div class="submit-text">
                      <span class="submit-label">
                        {secondarySubmit.caption}
                      </span>
                      {#if secondarySubmit.description}
                        <span class="submit-description">
                          {secondarySubmit.description}
                        </span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/snippet}
            </Popover>
          </div>
        {:else}
          <Button
            variant={effectiveSubmitVariant}
            title={emptyBodyTooltip}
            disabled={submitDisabled}
            onclick={submitFn}>
            {#if submitInProgress}
              Saving…
            {:else}
              {submitCaption}
              <span class="shortcut">{utils.modifierKey()}↵</span>
            {/if}
          </Button>
        {/if}
      </div>
    </div>
  {/if}
</div>
