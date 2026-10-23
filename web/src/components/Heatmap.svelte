<script lang="ts">
  import type { Activity } from "@app/lib/activity";

  import { dayKey } from "@app/lib/activity";
  import { fade } from "svelte/transition";

  import { motion } from "@app/lib/motion";
  import { navigate } from "@app/lib/router.svelte";

  interface Props {
    items: Activity[];
    // Where a day links to, given its `dayKey`.
    dayHref: (day: string) => string;
    days?: number;
  }

  const { items, dayHref, days = 7 * 52 }: Props = $props();

  const PITCH = 10;
  const DAY = 86400000;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const SHOWN = 4;

  function dateOf(i: number): Date {
    return new Date(Date.now() - (days - 1 - i) * DAY);
  }

  // Activity grouped by the day it happened, oldest day first.
  const byDay = $derived.by(() => {
    const index: Record<string, Activity[]> = {};
    for (const a of items) (index[dayKey(a.time)] ??= []).push(a);
    return Array.from({ length: days }, (_, i) => index[dayKey(dateOf(i).getTime())] ?? []);
  });
  // Columns are calendar weeks starting on Sunday, so each row is a weekday.
  const offset = $derived(dateOf(0).getDay());
  const weeks = $derived(Math.ceil((days + offset) / 7));
  const col = (i: number) => Math.floor((i + offset) / 7);
  const row = (i: number) => (i + offset) % 7;

  // Intensity buckets are the thirds of active days, so one unusually busy
  // day doesn't flatten everything else.
  const thirds = $derived.by(() => {
    const counts = byDay.map(d => d.length).filter(n => n > 0).sort((a, b) => a - b);
    const at = (q: number) => counts[Math.min(counts.length - 1, Math.floor(q * counts.length))] ?? 1;
    return [at(1 / 3), at(2 / 3)];
  });
  const total = $derived(byDay.reduce((n, d) => n + d.length, 0));

  // Quiet days are small circles, busier days large circles and the busiest
  // solid squares, like the pixel art in avatars.
  function level(c: number): 0 | 1 | 2 | 3 {
    if (c === 0) return 0;
    const [t1, t2] = thirds;
    return c <= t1 ? 1 : c <= t2 ? 2 : 3;
  }

  const months = $derived.by(() => {
    const starts: { col: number; date: Date }[] = [];
    for (let w = 0; w < weeks; w++) {
      const date = dateOf(Math.max(0, w * 7 - offset));
      if (starts.at(-1)?.date.getMonth() !== date.getMonth()) starts.push({ col: w, date });
    }
    const labelled = starts.map(({ col, date }, i) => ({
      col,
      label: `${MONTHS[date.getMonth()]}${i === 0 || date.getMonth() === 0 ? ` ${date.getFullYear()}` : ""}`,
    }));
    // Drop labels that would run into the one before; a label with a year is
    // about twice as wide.
    const out: typeof labelled = [];
    for (const m of labelled) {
      const prev = out.at(-1);
      if (!prev || m.col - prev.col >= (prev.label.includes(" ") ? 6 : 3)) out.push(m);
    }
    return out;
  });

  let hovered = $state<number | undefined>(undefined);
  let tip: HTMLDivElement | undefined = $state();
  // Opens below the day instead when there isn't room above it, for example
  // under the sticky header.
  let below = $state(false);

  $effect(() => {
    void hovered;
    below = false;
    requestAnimationFrame(() => {
      if (!tip) return;
      const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      below = tip.getBoundingClientRect().top < header + 8;
    });
  });

  const verb: Record<Activity["kind"], string> = {
    commit: "committed to",
    issue: "opened an issue in",
    patch: "opened a patch in",
    review: "reviewed in",
    comment: "commented in",
    release: "published a release of",
  };

  function repoName(a: Activity) {
    return a.repo.name;
  }
</script>

<style>
  .heatmap {
    position: relative;
    width: 100%;
  }
  .months {
    position: relative;
    height: 1rem;
    margin-bottom: 0.25rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .months span {
    position: absolute;
    top: 0;
    white-space: nowrap;
  }
  .grid {
    position: relative;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .empty {
    fill: var(--color-border-mid);
  }
  .on {
    fill: var(--color-surface-brand-primary);
  }
  .hit {
    fill: transparent;
  }
  .day.active {
    cursor: pointer;
  }
  .day.hovered .hit {
    fill: var(--color-surface-alpha-subtle);
  }
  .tip {
    position: absolute;
    z-index: 5;
    transform: translate(-50%, calc(-100% - 0.5rem));
    width: max-content;
    max-width: 20rem;
    padding: 0.5rem 0.625rem;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    box-shadow: var(--elevation-low);
    font: var(--txt-body-s-regular);
    color: var(--color-text-secondary);
    pointer-events: none;
  }
  .tip.left {
    transform: translate(-0.75rem, calc(-100% - 0.5rem));
  }
  .tip.right {
    transform: translate(calc(-100% + 0.75rem), calc(-100% - 0.5rem));
  }
  .tip.below {
    transform: translate(-50%, 0.5rem);
  }
  .tip.below.left {
    transform: translate(-0.75rem, 0.5rem);
  }
  .tip.below.right {
    transform: translate(calc(-100% + 0.75rem), 0.5rem);
  }
  .tip strong {
    display: block;
    margin-bottom: 0.25rem;
    font: var(--txt-body-s-semibold);
    color: var(--color-text-primary);
  }
  .tip ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .tip li {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tip .repo {
    color: var(--color-text-primary);
  }
  .more,
  .hint {
    color: var(--color-text-tertiary);
  }
  .hint {
    margin-top: 0.25rem;
  }
  .caption {
    margin-top: 0.5rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
</style>

<div class="heatmap">
  <div class="months">
    {#each months as m (m.col)}
      <span style:left={`${(m.col / weeks) * 100}%`}>{m.label}</span>
    {/each}
  </div>
  <div class="grid">
    <svg
      viewBox={`0 0 ${weeks * PITCH} ${7 * PITCH}`}
      role="img"
      aria-label={`${total} contributions`}
      onmouseleave={() => (hovered = undefined)}>
      {#each byDay as day, i (i)}
        {@const cx = col(i) * PITCH + PITCH / 2}
        {@const cy = row(i) * PITCH + PITCH / 2}
        {@const l = level(day.length)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <g
          class="day"
          class:active={day.length > 0}
          class:hovered={hovered === i}
          onmouseenter={() => (hovered = day.length > 0 ? i : undefined)}
          onclick={() => day.length > 0 && navigate(dayHref(dayKey(dateOf(i).getTime())))}>
          <rect class="hit" x={cx - PITCH / 2} y={cy - PITCH / 2} width={PITCH} height={PITCH} rx="1.5" />
          {#if l === 0}
            <circle class="empty" {cx} {cy} r="1" />
          {:else if l === 1}
            <circle class="on" {cx} {cy} r="2" opacity="0.55" />
          {:else if l === 2}
            <circle class="on" {cx} {cy} r="3.5" opacity="0.75" />
          {:else}
            <rect class="on" x={cx - 4.25} y={cy - 4.25} width="8.5" height="8.5" />
          {/if}
        </g>
      {/each}
    </svg>

    {#if hovered !== undefined}
      {@const day = byDay[hovered]}
      {@const c = col(hovered)}
      <div
        bind:this={tip}
        in:fade={motion({ duration: 120 })}
        out:fade={motion({ duration: 100 })}
        class="tip"
        class:left={c < 6}
        class:right={c > weeks - 7}
        class:below
        style:left={`${((c + 0.5) / weeks) * 100}%`}
        style:top={`${((row(hovered) + (below ? 1 : 0)) / 7) * 100}%`}>
        <strong>
          {day.length} contribution{day.length === 1 ? "" : "s"} on
          {dateOf(hovered).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
        </strong>
        <ul>
          {#each day.slice(0, SHOWN) as a (a.id)}
              <li>{verb[a.kind]} <span class="repo">{repoName(a)}</span> · {a.title}</li>
            {/each}
          </ul>
        {#if day.length > SHOWN}<div class="more">+{day.length - SHOWN} more</div>{/if}
        <div class="hint">Click to see the day's activity</div>
      </div>
    {/if}
  </div>
  <div class="caption">{total} contributions in the last year, signed with this identity</div>
</div>
