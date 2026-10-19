<script lang="ts">
  import type { Snippet } from "svelte";
  import type { FileDiff } from "@app/node/diff";

  import Icon from "./Icon.svelte";

  interface Props {
    files: FileDiff[];
    // Rendered under a new-side line, e.g. review comments or a draft.
    below?: Snippet<[string, number]>;
    // Lines that have something to show below them, keyed "path:line".
    marked?: Set<string>;
    onAddComment?: (path: string, line: number) => void;
    allCollapsed?: boolean;
  }

  const { files, below, marked, onAddComment, allCollapsed = false }: Props = $props();

  let collapsed = $state<Record<string, boolean>>({});

  $effect(() => {
    const value = allCollapsed;
    collapsed = Object.fromEntries(files.map(f => [f.path, value]));
  });
</script>

<style>
  .file {
    margin-bottom: 1rem;
    overflow: clip;
  }
  .file-head {
    position: sticky;
    top: var(--diff-sticky-top, 3.5rem);
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 1rem;
    background: var(--color-surface-base);
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-semibold);
  }
  .file-head button {
    all: unset;
    cursor: pointer;
    display: flex;
    color: var(--color-text-tertiary);
  }
  .stat-add {
    color: var(--color-feedback-success-text);
    font: var(--txt-body-s-semibold);
  }
  .stat-del {
    color: var(--color-feedback-error-text);
    font: var(--txt-body-s-semibold);
  }
  .status {
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
    margin-left: auto;
    text-transform: capitalize;
  }
  .lines {
    overflow-x: auto;
    font: var(--txt-code-regular);
    font-size: 0.8125rem;
    line-height: 1.25rem;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  td {
    padding: 0;
    vertical-align: top;
  }
  .num {
    width: 1%;
    min-width: 2.75rem;
    padding: 0 0.5rem;
    text-align: right;
    color: var(--color-text-quaternary);
    user-select: none;
    white-space: nowrap;
  }
  .sign {
    width: 1rem;
    user-select: none;
    padding-left: 0.25rem;
    color: var(--color-text-tertiary);
  }
  .text {
    white-space: pre;
    padding-right: 1rem;
  }
  tr.add {
    background: color-mix(in srgb, var(--color-diff-addition) 14%, transparent);
  }
  tr.add .num {
    background: color-mix(in srgb, var(--color-diff-addition) 22%, transparent);
  }
  tr.del {
    background: color-mix(in srgb, var(--color-diff-deletion) 12%, transparent);
  }
  tr.del .num {
    background: color-mix(in srgb, var(--color-diff-deletion) 20%, transparent);
  }
  tr.hunk td {
    background: var(--color-surface-subtle);
    color: var(--color-text-tertiary);
    padding: 0.25rem 1rem;
    font-size: 0.75rem;
  }
  .add-comment {
    position: relative;
  }
  .add-comment button {
    all: unset;
    position: absolute;
    left: -0.25rem;
    top: 0.125rem;
    width: 1rem;
    height: 1rem;
    display: none;
    align-items: center;
    justify-content: center;
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-brand-primary);
    color: var(--color-text-on-brand);
    cursor: pointer;
  }
  tr:hover .add-comment button {
    display: flex;
  }
  .below td {
    padding: 0;
    font: var(--txt-body-m-regular);
    white-space: normal;
  }
  .below-inner {
    padding: 0.5rem 1rem 0.5rem 6.5rem;
    background: var(--color-surface-base);
    border-top: 1px solid var(--color-border-subtle);
    border-bottom: 1px solid var(--color-border-subtle);
  }
</style>

{#each files as file (file.path)}
  <div class="card file" id={`file-${file.path}`}>
    <div class="file-head">
      <button onclick={() => (collapsed[file.path] = !collapsed[file.path])} aria-label="Toggle file">
        <Icon name={collapsed[file.path] ? "chevron-right" : "chevron-down"} />
      </button>
      <span class="ellipsis">{file.path}</span>
      <span class="stat-add">+{file.additions}</span>
      <span class="stat-del">−{file.deletions}</span>
      <span class="status">{file.status}</span>
    </div>
    {#if !collapsed[file.path]}
      <div class="lines">
        <table>
          <tbody>
            {#each file.hunks as hunk, h (h)}
              <tr class="hunk">
                <td colspan="4">
                  @@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                </td>
              </tr>
              {#each hunk.lines as line, l (l)}
                <tr class={line.type}>
                  <td class="num">{line.type !== "add" ? line.old : ""}</td>
                  <td class="num add-comment">
                    {line.type !== "del" ? line.new : ""}
                    {#if onAddComment && line.type !== "del"}
                      <button
                        title="Comment on this line"
                        onclick={() => onAddComment(file.path, line.new)}>
                        <Icon name="plus" />
                      </button>
                    {/if}
                  </td>
                  <td class="sign">{line.type === "add" ? "+" : line.type === "del" ? "−" : ""}</td>
                  <td class="text">{line.text}</td>
                </tr>
                {#if below && line.type !== "del" && marked?.has(`${file.path}:${line.new}`)}
                  <tr class="below">
                    <td colspan="4">
                      <div class="below-inner">{@render below(file.path, line.new)}</div>
                    </td>
                  </tr>
                {/if}
              {/each}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
{/each}
