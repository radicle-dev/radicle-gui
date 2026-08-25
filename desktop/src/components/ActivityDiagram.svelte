<script lang="ts">
  import type { WeeklyActivity } from "@app/lib/activity";

  interface Props {
    id: string;
    activity: WeeklyActivity[];
    viewBoxHeight?: number;
    styleColor?: string;
  }

  const {
    id,
    activity,
    viewBoxHeight = 100,
    styleColor = "var(--color-text-brand)",
  }: Props = $props();

  const viewBoxWidth = 493;
  const totalWeeks = 52;
  const columns = 40;
  const cellGap = 2;
  const rows = 10;
  // Commits per bucket that reach full height. Absolute rather than normalised
  // per repo, so bar heights stay comparable between rows.
  const activityThreshold = 70;

  interface Rect {
    x: number;
    y: number;
    opacity: number;
  }

  const cellSize = $derived(
    Math.max(
      1,
      Math.min(
        Math.floor((viewBoxWidth - (columns - 1) * cellGap) / columns),
        Math.floor((viewBoxHeight - (rows - 1) * cellGap) / rows),
      ),
    ),
  );

  // Commits per week for the last year, oldest gaps filled with zeroes so a
  // quiet stretch renders as baseline rather than collapsing the diagram.
  const weeklyCounts = $derived.by(() => {
    const counts: number[] = [];
    let week = 0;
    for (const point of activity) {
      if (point.week - week > 1) {
        counts.push(...new Array(point.week - week - 1).fill(0));
      }
      counts.push(point.commits.length);
      week = point.week;
    }
    if (counts.length < totalWeeks) {
      counts.push(...new Array(totalWeeks - counts.length).fill(0));
    }
    return counts.slice(0, totalWeeks);
  });

  const rects = $derived.by((): Rect[] => {
    const boundaries = Array.from({ length: columns + 1 }, (_, i) =>
      Math.floor((i * totalWeeks) / columns),
    );
    const colWidth = cellSize + cellGap + 8;
    const rowHeight = cellSize + cellGap;
    const result: Rect[] = [];

    for (let i = 0; i < columns; i++) {
      let count = 0;
      for (let j = boundaries[i]; j < boundaries[i + 1]; j++) {
        count += weeklyCounts[j] ?? 0;
      }
      // A single baseline row keeps inactive buckets visible; anything non-zero
      // rises at least two rows so it reads as activity.
      const height =
        count === 0
          ? 1
          : Math.max(
              2,
              Math.min(rows, Math.round((count / activityThreshold) * rows)),
            );

      for (let r = 0; r < height; r++) {
        result.push({
          x: viewBoxWidth - cellSize - i * colWidth,
          y: viewBoxHeight - (r + 1) * rowHeight,
          opacity: count === 0 ? 0.25 : 0.25 + 0.75 * (r / (rows - 1)),
        });
      }
    }
    return result;
  });
</script>

<svg
  style:min-width="130px"
  style:color={styleColor}
  viewBox="0 0 {viewBoxWidth} {viewBoxHeight + 16}"
  xmlns="http://www.w3.org/2000/svg"
  id={`activity-diagram-${id}`}>
  <g>
    {#each rects as rect, i (i)}
      <rect
        x={rect.x}
        y={rect.y}
        width={cellSize}
        height={cellSize}
        fill="currentColor"
        fill-opacity={rect.opacity} />
    {/each}
  </g>
</svg>
