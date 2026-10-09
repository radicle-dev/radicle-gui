<script lang="ts">
  import type { Config } from "@bindings/config/Config";
  import type { ErrorWrapper } from "@bindings/error/ErrorWrapper";

  import { cachedConfig, invoke } from "@app/lib/invoke";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  const SEED_PATTERN = /^z[1-9A-HJ-NP-Za-km-z]+@\S+:\d+$/;

  let saved: string[] = $state([]);
  let drafts: string[] = $state([]);
  let loaded = $state(false);
  let error: string | undefined = $state(undefined);
  let saving = $state(false);
  let justSaved = $state(false);
  let dragging: number | undefined = $state(undefined);
  let list: HTMLElement | undefined = $state(undefined);

  const seeds = $derived(drafts.map(d => d.trim()).filter(d => d !== ""));
  const invalid = $derived(
    drafts.map(d => d.trim() !== "" && !SEED_PATTERN.test(d.trim())),
  );

  void cachedConfig().then(config => {
    saved = config.preferredSeeds;
    drafts = [...saved];
    loaded = true;
  });

  async function save() {
    if (saving || invalid.some(Boolean)) return;
    if (seeds.join("\n") === saved.join("\n")) return;

    saving = true;
    error = undefined;
    try {
      const config = await invoke<Config>("set_preferred_seeds", { seeds });
      cachedConfig.clear();
      saved = config.preferredSeeds;
      justSaved = true;
      setTimeout(() => (justSaved = false), 2000);
    } catch (e) {
      error = (e as ErrorWrapper).message ?? "Could not save your config";
    } finally {
      saving = false;
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= drafts.length || to === from) return;
    const next = [...drafts];
    const [seed] = next.splice(from, 1);
    next.splice(to, 0, seed);
    drafts = next;
  }

  function onHandleDown(event: PointerEvent, index: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = index;
  }

  function onHandleMove(event: PointerEvent) {
    if (dragging === undefined || !list) return;
    const rows = Array.from(list.querySelectorAll<HTMLElement>(".seed"));
    const target = rows.findIndex(row => {
      const rect = row.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    const to = target === -1 ? rows.length - 1 : target;
    if (to !== dragging) {
      move(dragging, to);
      dragging = to;
    }
  }

  function onHandleUp() {
    if (dragging === undefined) return;
    dragging = undefined;
    void save();
  }

  function onHandleKeydown(event: KeyboardEvent, index: number) {
    const to =
      event.key === "ArrowUp"
        ? index - 1
        : event.key === "ArrowDown"
          ? index + 1
          : undefined;
    if (to === undefined || to < 0 || to >= drafts.length) return;
    event.preventDefault();
    move(index, to);
    void save();
    requestAnimationFrame(() =>
      list?.querySelectorAll<HTMLElement>(".handle")[to]?.focus(),
    );
  }

  function remove(index: number) {
    drafts = drafts.filter((_, i) => i !== index);
    void save();
  }
</script>

<style>
  .seeds {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .seed {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .seed.dragging {
    opacity: 0.5;
  }
  .handle {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--color-text-tertiary);
    cursor: grab;
    touch-action: none;
  }
  .handle:hover {
    background-color: var(--color-surface-mid);
  }
  .handle:disabled {
    cursor: not-allowed;
  }
  .seeds.reordering,
  .seeds.reordering * {
    cursor: grabbing !important;
  }
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .hint {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .error {
    color: var(--color-feedback-error-text);
  }
</style>

<div class="seeds" class:reordering={dragging !== undefined} bind:this={list}>
  {#each drafts as _, index (index)}
    <div class="seed" class:dragging={dragging === index}>
      {#if drafts.length > 1}
        <button
          class="handle"
          title="Drag to reorder"
          aria-label="Reorder seed, use the up and down arrow keys"
          disabled={saving}
          onpointerdown={e => onHandleDown(e, index)}
          onpointermove={onHandleMove}
          onpointerup={onHandleUp}
          onpointercancel={onHandleUp}
          onkeydown={e => onHandleKeydown(e, index)}>
          <Icon name="drag-handle" />
        </button>
      {/if}
      <TextInput
        name={`preferred-seed-${index}`}
        placeholder="z6Mk…@seed.example.com:8776"
        disabled={saving || !loaded}
        valid={!invalid[index]}
        bind:value={drafts[index]}
        oninput={() => (error = undefined)}
        onSubmit={save}
        onBlur={save}
        onDismiss={() => {
          drafts = [...saved];
          error = undefined;
        }} />
      <Button
        variant="naked"
        title="Remove seed"
        disabled={saving}
        onclick={() => remove(index)}>
        <span style:color="var(--color-text-tertiary)">
          <Icon name="close" />
        </span>
      </Button>
    </div>
  {/each}
  <div class="footer">
    {#if error}
      <span class="hint error">{error}</span>
    {:else if invalid.some(Boolean)}
      <span class="hint error">Use the form node-id@host:port</span>
    {:else if justSaved}
      <span class="hint">Saved to your Radicle config</span>
    {:else if drafts.length > 1}
      <span class="hint">The first seed is used whenever one is needed</span>
    {:else}
      <span></span>
    {/if}
    <Button
      variant="ghost"
      disabled={saving || !loaded}
      onclick={() => (drafts = [...drafts, ""])}>
      <Icon name="plus" />
      Add seed
    </Button>
  </div>
</div>
