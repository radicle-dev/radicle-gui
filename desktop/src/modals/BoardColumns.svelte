<script lang="ts">
  import type { Closes } from "@bindings/cob/board/Closes";
  import type { Column } from "@bindings/cob/board/Column";

  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";

  import { disableHide, enableHide, hide } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";

  interface Props {
    columns: Column[];
    save: (columns: Column[]) => Promise<void>;
  }

  const { columns: initial, save }: Props = $props();

  interface Row {
    key: number;
    id?: string;
    name: string;
    closes: Closes | "";
  }

  // svelte-ignore state_referenced_locally
  let rows: Row[] = $state(
    initial.map((c, key) => ({
      key,
      id: c.id,
      name: c.name,
      closes: c.closes ?? "",
    })),
  );
  // svelte-ignore state_referenced_locally
  let nextKey = initial.length;

  let listEl: HTMLElement | undefined = $state();
  let dragging: number | undefined = $state();

  function startDrag(event: PointerEvent, key: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = key;
  }

  // Reorders as the pointer crosses a row's middle, so the rows already sit
  // where they'll be saved.
  function onPointerMove(event: PointerEvent) {
    if (dragging === undefined || !listEl) return;
    const from = rows.findIndex(r => r.key === dragging);
    let to = 0;
    for (const el of listEl.querySelectorAll<HTMLElement>("[data-row]")) {
      if (Number(el.dataset.row) === dragging) continue;
      const rect = el.getBoundingClientRect();
      const matrix = new DOMMatrix(getComputedStyle(el).transform);
      if (rect.top - matrix.m42 + rect.height / 2 < event.clientY) to++;
    }
    if (to !== from) {
      const next = [...rows];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      rows = next;
    }
  }
  let working = $state(false);
  let error = $state<string | undefined>(undefined);

  const valid = $derived(
    rows.length > 0 && rows.every(r => r.name.trim().length > 0),
  );

  function slug(name: string): string {
    return (
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "column"
    );
  }

  function toColumns(): Column[] {
    const taken = rows.flatMap(r => (r.id ? [r.id] : []));
    return rows.map(row => {
      let id = row.id;
      if (!id) {
        const base = slug(row.name);
        id = base;
        for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
        taken.push(id);
      }
      return {
        id,
        name: row.name.trim(),
        ...(row.closes ? { closes: row.closes } : {}),
      };
    });
  }

  function move(index: number, by: number) {
    const target = index + by;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    rows = next;
  }

  async function submit() {
    if (working || !valid) return;
    working = true;
    error = undefined;
    disableHide();
    try {
      await save(toColumns());
      enableHide();
      hide();
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : ((e as { message?: string }).message ?? "Saving failed.");
      enableHide();
    } finally {
      working = false;
    }
  }
</script>

<style>
  .modal {
    width: 32rem;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-lg);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    height: 3.25rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .title {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
  }
  .row.dragging {
    position: relative;
    z-index: 1;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.15);
  }
  .handle {
    cursor: grab;
    touch-action: none;
  }
  .row.dragging .handle {
    cursor: grabbing;
  }
  input,
  select {
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-primary);
    font: var(--txt-body-m-regular);
  }
  input {
    flex: 1;
    min-width: 0;
  }
  input:focus,
  select:focus {
    outline: none;
    border-color: var(--color-border-brand);
  }
  .icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
  }
  .icon-button:hover:not(:disabled) {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .icon-button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .add {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--color-text-secondary);
    font: var(--txt-body-m-regular);
    cursor: pointer;
  }
  .add:hover {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .note {
    color: var(--color-text-tertiary);
  }
  .error {
    color: var(--color-feedback-error-text);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0 1.5rem 1.5rem;
  }
</style>

<svelte:window
  onpointermove={onPointerMove}
  onpointerup={() => (dragging = undefined)}
  onpointercancel={() => (dragging = undefined)} />

<div class="modal">
  <div class="header">
    <span class="title">Edit columns</span>
    <Button variant="naked" onclick={hide}>
      <span style:color="var(--color-text-tertiary)">
        <Icon name="close" />
      </span>
    </Button>
  </div>
  <div class="body">
    <div class="rows" bind:this={listEl}>
      {#each rows as row, index (row.key)}
        <div
          class="row"
          class:dragging={dragging === row.key}
          data-row={row.key}
          animate:flip={{ duration: 150, easing: cubicOut }}>
          <button
            class="icon-button handle"
            title="Drag to reorder"
            aria-label="Drag to reorder, or use the arrow keys"
            onpointerdown={e => startDrag(e, row.key)}
            onkeydown={e => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                move(index, e.key === "ArrowUp" ? -1 : 1);
              }
            }}>
            <Icon name="drag-handle" />
          </button>
          <input
            aria-label="Column name"
            placeholder="Column name"
            bind:value={row.name} />
          <select aria-label="What the column does" bind:value={row.closes}>
            <option value="">Keeps issues open</option>
            <option value="solved">Closes as solved</option>
            <option value="other">Closes as other</option>
          </select>
          <button
            class="icon-button"
            title="Delete column"
            disabled={rows.length === 1}
            onclick={() => (rows = rows.filter((_, i) => i !== index))}>
            <Icon name="trash" />
          </button>
        </div>
      {/each}
    </div>
    <button
      class="add"
      onclick={() =>
        (rows = [...rows, { key: nextKey++, name: "", closes: "" }])}>
      <Icon name="plus" />Add column
    </button>
    <span class="note">
      Cards in a deleted column go back to the first column that keeps issues
      open.
    </span>
    {#if error}
      <span class="error">{error}</span>
    {/if}
  </div>
  <div class="actions">
    <Button variant="outline" onclick={hide}>Cancel</Button>
    <Button
      variant="secondary"
      disabled={working || !valid}
      onclick={() => void submit()}>
      {working ? "Saving…" : "Save"}
    </Button>
  </div>
</div>
