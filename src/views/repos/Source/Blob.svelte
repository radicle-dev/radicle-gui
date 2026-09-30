<script lang="ts">
  import type { BaseUrl, Blob } from "@http-client";

  import { afterUpdate, onDestroy, onMount } from "svelte";
  import { toHtml } from "hast-util-to-html";

  import * as Syntax from "@app/lib/syntax";
  import { isImagePath, isMarkdownPath, isSvgPath } from "@app/lib/utils";
  import { lineNumbersGutter } from "@app/lib/syntax";

  import Button from "@app/components/Button.svelte";
  import CommitButton from "@app/views/repos/components/CommitButton.svelte";
  import File from "@app/components/File.svelte";
  import FilePath from "@app/components/FilePath.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import Placeholder from "@app/components/Placeholder.svelte";
  import Radio from "@app/components/Radio.svelte";

  export let baseUrl: BaseUrl;
  export let repoId: string;
  export let path: string;
  export let blob: Blob;
  export let highlighted: Syntax.Root | undefined;
  export let rawPath: string;

  $: lastCommit = blob.lastCommit;

  $: content = highlighted ? lineNumbersGutter(highlighted) : undefined;
  $: extension = path.split(".").pop();

  let selectedLineId: string | undefined = undefined;
  $: {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    content;
    updateSelectedLineId();
  }

  function updateSelectedLineId() {
    const fragmentId = window.location.hash.substring(1);
    if (fragmentId && fragmentId.match(/^L\d+$/)) {
      selectedLineId = fragmentId;
    } else {
      selectedLineId = undefined;
    }
  }

  $: isMarkdown = isMarkdownPath(blob.path);
  $: isImage = isImagePath(blob.path);
  $: isSvg = isSvgPath(blob.path);
  $: enablePreview = isMarkdown || isSvg;
  $: preview = enablePreview && selectedLineId === undefined;

  afterUpdate(() => {
    for (const item of document.getElementsByClassName("highlight")) {
      item.classList.remove("highlight");
    }
    if (selectedLineId) {
      const target = document.getElementById(selectedLineId);
      if (target) {
        target.classList.add("highlight");
        target.scrollIntoView({ block: "center" });
      }
    }
  });

  onMount(async () => {
    window.addEventListener("hashchange", updateSelectedLineId);
  });

  onDestroy(() => {
    window.removeEventListener("hashchange", updateSelectedLineId);
  });
</script>

<style>
  .code :global(.line-number) {
    font: var(--txt-code-regular);
    color: var(--color-text-disabled);
    text-align: right;
    padding: 0;
    user-select: none;
  }
  .code :global(.line-number a) {
    display: block;
    padding: 0 1rem;
  }
  .code :global(.line-number:hover) {
    cursor: pointer;
    color: var(--color-text-tertiary);
  }

  .code :global(.content) {
    display: inline;
    font: var(--txt-code-regular);
    margin: 0;
  }

  .code :global(.line) {
    line-height: 22px; /* This seems to be the line-height of a pre code block */
  }
  .code :global(.highlight) {
    background-color: var(--color-surface-mid);
    box-shadow: 0 0 0 1px var(--color-border-brand);
  }
  .code :global(.highlight td:first-child) {
    background-color: var(--color-surface-mid);
    border-left: 1px solid var(--color-border-brand);
  }
  .code :global(.highlight td:last-child) {
    background-color: var(--color-surface-mid);
    border-right: 1px solid var(--color-border-brand);
  }

  .code :global(.line-content) {
    padding: 0;
    width: 100%;
  }

  .code {
    width: 100%;
    border-spacing: 0;
    overflow-x: auto;
    font: var(--txt-body-m-regular);
    background-color: var(--color-surface-canvas);
    padding-top: 1rem;
    margin-bottom: 1.5rem;
  }

  .teaser-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .no-scrollbar {
    scrollbar-width: none;
  }

  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .markdown-wrapper {
    padding: 2rem;
    background-color: var(--color-surface-canvas);
    max-width: 75rem;
    margin: 0 auto;
  }
  @media (max-width: 719.98px) {
    .markdown-wrapper {
      padding: 1rem;
    }
  }
</style>

<File sticky={false} containerBackground="var(--color-surface-canvas)">
  <FilePath slot="left-header" filenameWithPath={blob.path} />
  <svelte:fragment slot="right-header">
    <CommitButton {repoId} {baseUrl} commit={lastCommit} />
    <div class="global-hide-on-mobile-down teaser-buttons">
      {#if enablePreview}
        <Radio ariaLabel="Toggle render method">
          <Button
            styleBorderRadius="0"
            variant={!preview ? "selected" : "not-selected"}
            on:click={() => {
              // eslint-disable-next-line
              preview = false;
            }}>
            <Icon name="chevron-left-right" />Code
          </Button>
          <Button
            styleBorderRadius="0"
            variant={preview ? "selected" : "not-selected"}
            on:click={() => {
              window.location.hash = "";
              // eslint-disable-next-line
              preview = true;
            }}>
            <Icon name="eye" />Preview
          </Button>
        </Radio>
      {/if}
      <a href="{rawPath}/{blob.path}" target="_blank" rel="noreferrer">
        <Button variant="gray-white">
          Raw <Icon name="open-external" />
        </Button>
      </a>
    </div>
  </svelte:fragment>

  {#if blob.binary && blob.content}
    {#if isImage && extension}
      <div style:margin="1rem 0" style:text-align="center">
        <img
          src={`data:image/${extension};base64,${blob.content}`}
          alt={path} />
      </div>
    {:else}
      <div style:margin="4rem 0" style:width="100%">
        <Placeholder iconName="binary-file" caption="Binary file" />
      </div>
    {/if}
  {:else if preview && blob.content}
    {#if isMarkdown}
      <div class="markdown-wrapper">
        <Markdown content={blob.content} {rawPath} {path} />
      </div>
    {:else if isSvg}
      <div style:margin="1rem 0" style:text-align="center">
        <img
          src={`data:image/svg+xml;base64,${btoa(blob.content)}`}
          alt={path} />
      </div>
    {/if}
  {:else if content}
    <table class="code no-scrollbar">
      {@html toHtml(content)}
    </table>
  {:else}
    <div style:margin="4rem 0" style:width="100%">
      <Placeholder iconName="empty-file" caption="Empty file" />
    </div>
  {/if}
</File>
