<script lang="ts">
  import type { Snippet } from "svelte";
  import type { FileDiff } from "@app/node/diff";

  import { diffStyle } from "@app/lib/diffStyle.svelte";

  import Icon from "./Icon.svelte";
  import PierreFileDiff from "./PierreFileDiff.svelte";

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
  .file.collapsed .file-head {
    border-bottom: none;
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
</style>

{#each files as file (file.path)}
  <div class="card file" class:collapsed={collapsed[file.path]} id={`file-${file.path}`}>
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
      <PierreFileDiff
        {file}
        {below}
        diffStyle={diffStyle.current}
        lines={[...(marked ?? [])].filter(k => k.startsWith(`${file.path}:`)).map(k => Number(k.slice(file.path.length + 1)))}
        onAddComment={onAddComment ? line => onAddComment(file.path, line) : undefined} />
    {/if}
  </div>
{/each}
