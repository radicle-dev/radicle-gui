<script lang="ts">
  interface Props {
    counts: number[];
  }

  const { counts }: Props = $props();
  const max = $derived(Math.max(1, ...counts));
  const weeks = $derived.by(() => {
    const out: number[][] = [];
    for (let i = 0; i < counts.length; i += 7) out.push(counts.slice(i, i + 7));
    return out;
  });
  const total = $derived(counts.reduce((a, b) => a + b, 0));
</script>

<style>
  .grid {
    display: flex;
    gap: 3px;
    overflow-x: auto;
  }
  .week {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .cell {
    width: 0.6875rem;
    height: 0.6875rem;
    border-radius: 2px;
    background: var(--color-surface-subtle);
  }
  .caption {
    margin-top: 0.5rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
</style>

<div class="grid">
  {#each weeks as week, w (w)}
    <div class="week">
      {#each week as c, d (d)}
        <span
          class="cell"
          title={`${c} contribution${c === 1 ? "" : "s"}`}
          style:background={c === 0
            ? undefined
            : `color-mix(in srgb, var(--color-surface-brand-primary) ${25 + (c / max) * 75}%, var(--color-surface-subtle))`}></span>
      {/each}
    </div>
  {/each}
</div>
<div class="caption">{total} contributions in the last six months, signed with this identity</div>
