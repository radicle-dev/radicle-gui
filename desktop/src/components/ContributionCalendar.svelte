<script lang="ts">
  import type { ContributionDay } from "@bindings/contribution/ContributionDay";

  import { pluralize } from "@app/lib/utils";

  interface Props {
    days: ContributionDay[];
    /** How many days back the grid covers. */
    span?: number;
  }

  const { days, span = 365 }: Props = $props();

  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const DAY_MS = 86_400_000;

  interface Cell {
    key: string;
    /** UTC midnight of the day, in epoch milliseconds. */
    time: number;
    count: number;
    level: 0 | 1 | 2 | 3 | 4;
  }

  const counts = $derived.by(() => {
    const map: Record<string, number> = {};
    for (const day of days) {
      map[day.date] = day.count;
    }
    return map;
  });

  const total = $derived(days.reduce((sum, day) => sum + day.count, 0));

  // Quartiles of the active days, not fractions of the busiest one. Scaling
  // against the maximum collapses under a single outlier: on a real profile
  // whose busiest day held 35 contributions, that put 54 of 62 active days in
  // the lowest band and rendered the year almost flat. Quartiles spread the
  // same data evenly across the four steps.
  const thresholds = $derived.by(() => {
    const active = days
      .map(day => day.count)
      .filter(count => count > 0)
      .sort((a, b) => a - b);
    if (active.length === 0) return undefined;
    const at = (fraction: number) =>
      active[Math.min(active.length - 1, Math.floor(active.length * fraction))];
    return { low: at(0.25), mid: at(0.5), high: at(0.75) };
  });

  function level(count: number): Cell["level"] {
    if (count <= 0 || !thresholds) return 0;
    if (count <= thresholds.low) return 1;
    if (count <= thresholds.mid) return 2;
    if (count <= thresholds.high) return 3;
    return 4;
  }

  // Columns are calendar weeks, rows are Sunday..Saturday, so the grid lines up
  // the way a wall calendar does. The last column is the current week, and the
  // first is padded out to its Sunday.
  const weeks = $derived.by((): Cell[][] => {
    const today = new Date();
    const end = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    );
    const spanStart = end - (span - 1) * DAY_MS;
    // Back up to that week's Sunday so every column holds a full week.
    const start = spanStart - new Date(spanStart).getUTCDay() * DAY_MS;

    const columns: Cell[][] = [];
    let column: Cell[] = [];
    for (let time = start; time <= end; time += DAY_MS) {
      const key = new Date(time).toISOString().slice(0, 10);
      const count = counts[key] ?? 0;
      column.push({ key, time, count, level: level(count) });
      if (column.length === 7) {
        columns.push(column);
        column = [];
      }
    }
    if (column.length > 0) {
      columns.push(column);
    }
    return columns;
  });

  // Roughly what a three-letter label occupies, used to decide how many will
  // fit without colliding.
  const LABEL_WIDTH = 30;

  let gridWidth = $state(0);
  const columnWidth = $derived(weeks.length > 0 ? gridWidth / weeks.length : 0);
  // How many columns a label needs to itself. The grid is fluid, so this is
  // measured rather than assumed: at a narrow window a column can be a few
  // pixels wide, and labelling every month would overlap them and push the
  // row wider than the pane.
  const labelGap = $derived(
    columnWidth > 0 ? Math.max(2, Math.ceil(LABEL_WIDTH / columnWidth)) : 2,
  );

  // A month label sits above the first column that falls in that month, which
  // is how the months stay aligned with the weeks beneath them.
  const monthLabels = $derived.by(() => {
    const labels: { index: number; label: string }[] = [];
    let previous = -1;
    weeks.forEach((column, index) => {
      const month = new Date(column[0].time).getUTCMonth();
      if (month !== previous) {
        const last = labels.at(-1);
        const clearOfPrevious =
          last === undefined || index - last.index >= labelGap;
        // Also needs room before the right edge, or it would overflow.
        const clearOfEnd = weeks.length - index >= labelGap;
        if (clearOfPrevious && clearOfEnd) {
          labels.push({ index, label: MONTHS[month] });
        }
        previous = month;
      }
    });
    return labels;
  });

  function title(cell: Cell): string {
    const when = new Date(cell.time).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    return cell.count === 0
      ? `No contributions on ${when}`
      : `${cell.count} ${pluralize("contribution", cell.count)} on ${when}`;
  }
</script>

<style>
  .calendar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    /* Dark is the base; the light override follows. Steps climb in brightness
       so a busier day reads as a stronger mark in either theme. */
    --cal-empty: var(--color-surface-subtle);
    --cal-1: var(--color-accent-green-800);
    --cal-2: var(--color-accent-green-600);
    --cal-3: var(--color-accent-green-500);
    --cal-4: var(--color-accent-green-300);
  }
  :global(html[data-theme="light"]) .calendar {
    --cal-empty: var(--color-surface-mid);
    --cal-1: var(--color-accent-green-200);
    --cal-2: var(--color-accent-green-400);
    --cal-3: var(--color-accent-green-600);
    --cal-4: var(--color-accent-green-800);
  }
  .headline {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .grid {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
  }
  /* Both rows share one column track sizing, so labels stay over their week. */
  .months,
  .weeks {
    display: grid;
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    gap: 2px;
  }
  .months {
    grid-auto-flow: column;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    height: 1rem;
    /* A label is wider than its column, so it is allowed to spill to the right
       of its own track; clipping keeps that from widening the pane. */
    overflow: hidden;
  }
  .month {
    grid-row: 1;
    white-space: nowrap;
  }
  .weeks {
    grid-auto-flow: column;
    grid-template-rows: repeat(7, auto);
  }
  /* Each day is a square cell holding a smaller dot, so the spacing around a
     dot is even on all four sides. The cell takes its width from the 1fr track
     and its height from the aspect ratio, which is what makes the whole
     graphic's height follow the window width. */
  .cell {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dot {
    width: 66%;
    height: 66%;
    border-radius: 50%;
    background-color: var(--cal-empty);
  }
  .cell.level-1 .dot {
    background-color: var(--cal-1);
  }
  .cell.level-2 .dot {
    background-color: var(--cal-2);
  }
  .cell.level-3 .dot {
    background-color: var(--cal-3);
  }
  .cell.level-4 .dot {
    background-color: var(--cal-4);
  }
</style>

<div class="calendar">
  <div class="headline">
    {total}
    {pluralize("contribution", total)} in the last year
  </div>
  <div class="grid" style:--columns={weeks.length} bind:clientWidth={gridWidth}>
    <div class="months">
      {#each monthLabels as label (label.index)}
        <span class="month" style:grid-column={label.index + 1}>
          {label.label}
        </span>
      {/each}
    </div>
    <div class="weeks">
      {#each weeks as column, index (index)}
        {#each column as cell (cell.key)}
          <div class="cell level-{cell.level}" title={title(cell)}>
            <span class="dot"></span>
          </div>
        {/each}
      {/each}
    </div>
  </div>
</div>
