<script lang="ts">
  import type {
    BaseUrl,
    ChangesetWithDiff,
    DiffContent,
    HunkLine,
  } from "@http-client";

  import { onDestroy, onMount } from "svelte";
  import { toHtml } from "hast-util-to-html";

  import * as Syntax from "@app/lib/syntax";
  import { isImagePath, isSvgPath } from "@app/lib/utils";

  import Badge from "@app/components/Badge.svelte";
  import File from "@app/components/File.svelte";
  import FilePath from "@app/components/FilePath.svelte";
  import IconButton from "@app/components/IconButton.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Link from "@app/components/Link.svelte";
  import Loading from "@app/components/Loading.svelte";
  import Placeholder from "@app/components/Placeholder.svelte";
  import Radio from "@app/components/Radio.svelte";
  import Button from "@app/components/Button.svelte";

  export let filePath: string;
  export let oldContent: string | undefined = undefined;
  export let content: string | undefined = undefined;
  export let oldFilePath: string | undefined = undefined;
  export let fileDiff: DiffContent;
  export let headerBadgeCaption: ChangesetWithDiff["status"];
  export let revision: string | undefined = undefined;
  export let baseUrl: BaseUrl;
  export let repoId: string;
  export let visible: boolean = false;
  export let expanded: boolean = true;

  let selection: Selection | undefined = undefined;
  let highlighting: { new?: string[]; old?: string[] } | undefined = undefined;
  let syntaxHighlightingLoading: boolean = false;
  let preview = false;
  const binaryLines =
    fileDiff.type === "plain" &&
    fileDiff.hunks.some(h => h.lines.some(l => !l.line));
  $: extension = filePath.split(".").pop();

  onMount(() => {
    window.addEventListener("click", deselectHandler);
    window.addEventListener("hashchange", updateSelection);

    updateSelection();

    if (selection) {
      document
        .getElementById(
          [filePath, "H" + selection.startHunk, "L" + selection.startLine].join(
            "-",
          ),
        )
        ?.scrollIntoView({ block: "center" });
    }
  });

  $: if (visible) {
    syntaxHighlightingLoading = true;
    void highlightContent().then(output => {
      // eslint-disable-next-line
      highlighting = output;
      // eslint-disable-next-line
      syntaxHighlightingLoading = false;
    });
  }

  onDestroy(() => {
    window.removeEventListener("click", deselectHandler);
    window.removeEventListener("hashchange", updateSelection);
  });

  function deselectHandler(e: MouseEvent) {
    if (!(
      e.target instanceof HTMLElement &&
      e.target.closest("[data-file-diff-select]")
    )) {
      updateHash("");
    }
  }

  async function highlightContent() {
    const extension = filePath.split(".").pop();
    const highlighted: { new?: string[]; old?: string[] } = {};
    if (extension) {
      if (content) {
        highlighted["new"] = toHtml(
          await Syntax.highlight(content, extension),
        ).split("\n");
      }
      if (oldContent) {
        highlighted["old"] = toHtml(
          await Syntax.highlight(oldContent, extension),
        ).split("\n");
      }
    }
    return Object.entries(highlighted).length > 0 ? highlighted : undefined;
  }

  function updateSelection() {
    const fragment = window.location.hash.substring(1);
    const match = fragment.match(/(.+):H(\d+)L(\d+)(H(\d+)L(\d+))?/);
    if (match && match[1] === filePath) {
      selection = {
        startHunk: parseInt(match[2]),
        startLine: parseInt(match[3]),
        endHunk: match[4] ? parseInt(match[5]) : undefined,
        endLine: match[4] ? parseInt(match[6]) : undefined,
      };
    } else {
      selection = undefined;
    }
  }

  function lineNumberR(line: HunkLine): string | number {
    switch (line.type) {
      case "addition": {
        return line.lineNo;
      }
      case "context": {
        return line.lineNoNew;
      }
      case "deletion": {
        return " ";
      }
    }
  }

  function lineNumberL(line: HunkLine): string | number {
    switch (line.type) {
      case "addition": {
        return " ";
      }
      case "context": {
        return line.lineNoOld;
      }
      case "deletion": {
        return line.lineNo;
      }
    }
  }

  function lineSign(line: HunkLine): string {
    switch (line.type) {
      case "addition": {
        return "+";
      }
      case "context": {
        return " ";
      }
      case "deletion": {
        return "-";
      }
    }
  }

  function isLineSelected(
    selection: Selection | undefined,
    hunkIdx: number,
    lineIdx: number,
  ): boolean {
    if (!selection) {
      return false;
    }

    if (selection.endHunk !== undefined && selection.endLine !== undefined) {
      return (
        hunkIdx >= selection.startHunk &&
        hunkIdx <= selection.endHunk &&
        (hunkIdx === selection.startHunk
          ? lineIdx >= selection.startLine
          : true) &&
        (hunkIdx === selection.endHunk ? lineIdx <= selection.endLine : true)
      );
    } else {
      return hunkIdx === selection.startHunk && lineIdx === selection.startLine;
    }
  }

  function hashFromSelection(
    hunkIdx: number,
    lineIdx: number,
    event: MouseEvent,
  ): string {
    const path = filePath;
    // single line selection
    if (!event.shiftKey) {
      return path + ":H" + hunkIdx + "L" + lineIdx;
    }

    if (!selection) {
      return "";
    }

    // range selection
    if (hunkIdx === selection.startHunk) {
      if (lineIdx >= selection.startLine) {
        return `${path}:H${hunkIdx}L${selection.startLine}H${hunkIdx}L${lineIdx}`;
      } else {
        return `${path}:H${hunkIdx}L${lineIdx}H${hunkIdx}L${selection.startLine}`;
      }
    } else if (hunkIdx < selection.startHunk) {
      return `${path}:H${hunkIdx}L${lineIdx}H${selection.startHunk}L${selection.startLine}`;
    } else {
      return `${path}:H${selection.startHunk}L${selection.startLine}H${hunkIdx}L${lineIdx}`;
    }
  }

  function selectLine(hunkIdx: number, lineIdx: number, event: MouseEvent) {
    updateHash(hashFromSelection(hunkIdx, lineIdx, event));
  }

  function updateHash(newHash: string) {
    if (newHash !== "") {
      window.location.hash = newHash;
    } else {
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
      selection = undefined;
    }
  }

  function hunkHeaderSelected(selection: Selection | undefined, hunk: number) {
    return (
      selection &&
      selection.endHunk !== undefined &&
      hunk > selection.startHunk &&
      hunk <= selection.endHunk
    );
  }

  interface Selection {
    startHunk: number;
    startLine: number;
    endHunk: number | undefined;
    endLine: number | undefined;
  }
</script>

<style>
  .container {
    font: var(--txt-body-m-regular);
    background: var(--color-surface-canvas);
    border-radius: 0 0 var(--border-radius-md) var(--border-radius-md);
    overflow-x: auto;
  }
  .actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 1rem;
  }
  .browse {
    margin-left: auto;
  }
  .expand-button {
    cursor: pointer;
    user-select: none;
    margin-right: 0.5rem;
  }
  .diff {
    font: var(--txt-code-regular);
    table-layout: fixed;
    border-collapse: collapse;
    margin: 0.5rem 0;
  }
  .diff-line {
    vertical-align: top;
  }
  .diff-line.type-addition > * {
    background-color: var(--color-feedback-success-bg);
  }
  .diff-line.type-deletion > * {
    background-color: var(--color-feedback-error-bg);
  }

  .diff-line.selected > * {
    background-color: var(--color-surface-subtle);
  }
  .diff-line.selected.type-addition > * {
    background-color: var(--color-feedback-success-bg-selected);
  }
  .diff-line.selected.type-deletion > * {
    background-color: var(--color-feedback-error-bg-selected);
  }

  .type-addition > .diff-line-number,
  .type-addition > .diff-line-type {
    color: var(--color-text-open);
  }
  .type-deletion > .diff-line-number,
  .type-deletion > .diff-line-type {
    color: var(--color-feedback-error-text);
  }

  .diff-line.selected .selection-indicator-left {
    background-color: var(--color-surface-brand-primary);
  }
  .type-addition.diff-line.selected .selection-indicator-left {
    background-color: var(--color-surface-brand-primary);
  }
  .type-deletion.diff-line.selected .selection-indicator-left {
    background-color: var(--color-surface-brand-primary);
  }

  .diff-line.selected .selection-indicator-right {
    background-color: var(--color-surface-brand-primary);
  }
  .type-addition.diff-line.selected .selection-indicator-right {
    background-color: var(--color-surface-brand-primary);
  }
  .type-deletion.diff-line.selected .selection-indicator-right {
    background-color: var(--color-surface-brand-primary);
  }

  .selection-start {
    box-shadow: 0 -1px 0 0 var(--color-border-brand);
    z-index: 1;
  }
  .selection-end {
    box-shadow: 0 1px 0 0 var(--color-border-brand);
    z-index: 1;
  }

  .selection-start.selection-end {
    box-shadow: 0 0 0 1px var(--color-border-brand);
    z-index: 1;
  }

  .diff-line-number {
    font: var(--txt-code-regular);
    text-align: right;
    user-select: none;
    line-height: 1.5rem;
    min-width: 3rem;
    cursor: pointer;
    color: var(--color-text-disabled);
  }
  .diff-line-number.left {
    position: relative;
    padding: 0 0.5rem 0 0.75rem;
  }
  .selection-indicator-left {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 1px;
  }
  .selection-indicator-right {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 1px;
  }
  .diff-line-number.right {
    padding: 0 0.75rem 0 0.5rem;
  }
  .diff-line-content {
    color: unset !important;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    width: 100%;
    padding-right: 0.5rem;
  }
  .diff-line-type {
    text-align: center;
    padding-left: 0.75rem;
    padding-right: 0.75rem;
    user-select: none;
  }
  .diff-expand-header {
    padding-left: 0.5rem;
    color: var(--color-text-tertiary);
  }
</style>

<File collapsable {expanded}>
  <svelte:fragment slot="left-header">
    {#if (headerBadgeCaption === "moved" || headerBadgeCaption === "copied") && oldFilePath}
      <span style="display: flex; align-items: center; flex-wrap: wrap;">
        <FilePath filenameWithPath={oldFilePath} />
        <span style:padding="0 0.5rem">→</span>
        <FilePath filenameWithPath={filePath} />
      </span>
    {:else}
      <FilePath filenameWithPath={filePath} />
    {/if}

    {#if headerBadgeCaption === "added"}
      <Badge variant="positive">added</Badge>
    {:else if headerBadgeCaption === "deleted"}
      <Badge variant="negative">deleted</Badge>
    {:else if headerBadgeCaption === "moved"}
      <Badge variant="foreground">moved</Badge>
    {:else if headerBadgeCaption === "copied"}
      <Badge variant="foreground">copied</Badge>
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="right-header" let:expanded>
    {#if revision}
      {#if syntaxHighlightingLoading}
        <Loading small />
      {/if}
      <div style:display="flex" style:align-items="center" style:gap="0.5rem">
        {#if isSvgPath(filePath) && expanded}
          <Radio ariaLabel="Toggle render method">
            <Button
              styleBorderRadius="0"
              variant={!preview ? "selected" : "not-selected"}
              on:click={() => {
                preview = false;
              }}>
              <Icon name="chevron-left-right" />Code
            </Button>
            <Button
              styleBorderRadius="0"
              variant={preview ? "selected" : "not-selected"}
              on:click={() => {
                window.location.hash = "";
                preview = true;
              }}>
              <Icon name="eye" />Preview
            </Button>
          </Radio>
        {/if}
        <Link
          route={{
            resource: "repo.source",
            repo: repoId,
            node: baseUrl,
            path: filePath,
            revision,
          }}>
          <IconButton title="View file at this commit">
            <Icon name="chevron-left-right" />
          </IconButton>
        </Link>
      </div>
    {/if}
  </svelte:fragment>

  <div class="container">
    {#if fileDiff.type === "plain" && !binaryLines}
      {#if fileDiff.hunks.length > 0 && !preview}
        <table class="diff" data-file-diff-select>
          <tbody>
            {#each fileDiff.hunks as hunk, hunkIdx}
              <tr
                class="diff-line hunk-header"
                class:selected={hunkHeaderSelected(selection, hunkIdx)}>
                <td colspan={2} style:position="relative">
                  <div class="selection-indicator-left"></div>
                </td>
                <td
                  colspan={6}
                  class="diff-expand-header"
                  style:position="relative">
                  {hunk.header}
                  <div class="selection-indicator-right"></div>
                </td>
              </tr>
              {#each hunk.lines as line, lineIdx}
                <tr
                  style:position="relative"
                  class={`diff-line type-${line.type}`}
                  class:selection-start={selection?.startHunk === hunkIdx &&
                    selection.startLine === lineIdx}
                  class:selection-end={(selection?.endHunk === hunkIdx &&
                    selection.endLine === lineIdx) ||
                    (selection?.startHunk === hunkIdx &&
                      selection.startLine === lineIdx &&
                      selection?.endHunk === undefined)}
                  class:selected={isLineSelected(selection, hunkIdx, lineIdx)}>
                  <td
                    id={[filePath, "H" + hunkIdx, "L" + lineIdx].join("-")}
                    class="diff-line-number left"
                    on:click={e => selectLine(hunkIdx, lineIdx, e)}>
                    <div class="selection-indicator-left"></div>
                    {lineNumberL(line)}
                  </td>
                  <td
                    class="diff-line-number right"
                    on:click={e => selectLine(hunkIdx, lineIdx, e)}>
                    {lineNumberR(line)}
                  </td>
                  <td class="diff-line-type" data-line-type={line.type}>
                    {lineSign(line)}
                  </td>
                  <td class="diff-line-content">
                    {#if highlighting}
                      {#if line.type === "addition" && highlighting.new}
                        {@html highlighting.new[line.lineNo - 1]}
                      {:else if line.type === "context" && highlighting.new}
                        {@html highlighting.new[line.lineNoNew - 1]}
                      {:else if line.type === "deletion" && highlighting.old}
                        {@html highlighting.old[line.lineNo - 1]}
                      {/if}
                    {:else}
                      {line.line}
                    {/if}
                  </td>
                  <td class="selection-indicator-right"></td>
                </tr>
              {/each}
            {/each}
          </tbody>
        </table>
      {:else if isImagePath(filePath) && extension && content}
        <div style:margin="1rem 0" style:text-align="center">
          <img
            src={`data:image/${extension};base64,${content}`}
            alt={filePath} />
        </div>
      {:else if preview && content}
        <div style:margin="1rem 0" style:text-align="center">
          <img
            src={`data:image/svg+xml;base64,${btoa(content)}`}
            alt={filePath} />
        </div>
      {:else}
        <div style:margin="1rem 0">
          <Placeholder iconName="document" caption="Empty file" inline />
        </div>
      {/if}
    {:else}
      <div style:margin="1rem 0">
        <Placeholder iconName="binary" caption="Binary file" inline />
      </div>
    {/if}
  </div>
</File>
