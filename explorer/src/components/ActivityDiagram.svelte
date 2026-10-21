<script lang="ts">
  import type { WeeklyActivity } from "@app/lib/commit";

  interface Props {
    id: string;
    activity: WeeklyActivity[];
    viewBoxHeight: number;
    styleColor: string;
  }

  const { id, activity, viewBoxHeight, styleColor }: Props = $props();

  const viewBoxWidth = 493;

  const totalWeeks = 52;
  const columns = 40;
  const cellGap = 2;
  const maxRows = 10;

  type Rect = { x: number; y: number; opacity: number };
  let rects: Rect[] = $state([]);

  const heightWithPadding = $derived.by(() => viewBoxHeight + 16);

  let cellSize: number = $state(0);
  let rows: number = 0;
  let colWidth: number = 0;
  let rowHeight: number = 0;

  $effect(() => {
    // Always draw diagram, even with no activity (to show baseline)
    if (activity !== undefined && activity !== null) {
      drawDiagram();
    }
  });

  function drawDiagram() {
    const commitCountArray: number[] = [];
    let week = 0;

    for (const point of activity) {
      if (point.week - week > 1) {
        commitCountArray.push(...new Array(point.week - week - 1).fill(0));
      }
      commitCountArray.push(point.commits.length);
      week = point.week;
    }

    if (commitCountArray.length < totalWeeks) {
      commitCountArray.push(
        ...new Array(totalWeeks - commitCountArray.length).fill(0),
      );
    } else if (commitCountArray.length > totalWeeks) {
      commitCountArray.splice(totalWeeks);
    }

    const boundaries = Array.from({ length: columns + 1 }, (_, i) =>
      Math.floor((i * totalWeeks) / columns),
    );
    const bucketCounts = Array.from({ length: columns }, (_, i) => {
      const start = boundaries[i];
      const end = boundaries[i + 1];
      let sum = 0;
      for (let j = start; j < end; j++) sum += commitCountArray[j] ?? 0;
      return sum;
    });

    // Use an absolute threshold for activity instead of normalizing to each project's max
    // This allows comparison across projects: high-activity projects will have taller bars
    const activityThreshold = 70; // commits per bucket to reach max height

    const maxCellFromWidth = Math.floor(
      (viewBoxWidth - (columns - 1) * cellGap) / columns,
    );
    const maxCellFromHeight = Math.floor(
      (viewBoxHeight - (maxRows - 1) * cellGap) / maxRows,
    );
    cellSize = Math.max(1, Math.min(maxCellFromWidth, maxCellFromHeight));
    colWidth = cellSize + cellGap + 8;
    rowHeight = cellSize + cellGap;
    rows = maxRows;

    function cellsForBucket(count: number): number {
      if (rows <= 0) return 0;
      // Always show at least 1 row for baseline visibility
      if (count === 0) return 1;
      // Scale based on absolute threshold, not project's max
      const scaled = Math.round((count / activityThreshold) * rows);
      // Any non-zero activity should be at least 2 rows (above baseline)
      return Math.max(2, Math.min(rows, scaled));
    }

    function opacityForRow(rowIndex: number, count: number): number {
      // Low baseline opacity for inactive periods (visible but subtle)
      if (count === 0) return 0.25;
      if (rows <= 1) return 1;
      const t = rowIndex / (rows - 1);
      return 0.25 + 0.75 * t;
    }

    const nextRects: Rect[] = [];
    for (let i = 0; i < columns; i++) {
      const count = bucketCounts[i];
      const heightCells = cellsForBucket(count);
      const x = viewBoxWidth - cellSize - i * colWidth;
      for (let r = 0; r < heightCells; r++) {
        const y = viewBoxHeight - (r + 1) * rowHeight;
        nextRects.push({ x, y, opacity: opacityForRow(r, count) });
      }
    }
    rects = nextRects;
  }
</script>

<svg
  style:min-width="130px"
  style:color={styleColor}
  viewBox="0 0 {viewBoxWidth} {heightWithPadding}"
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
