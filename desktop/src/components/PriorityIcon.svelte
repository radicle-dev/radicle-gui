<script lang="ts">
  import type { Priority } from "@app/lib/board";

  interface Props {
    priority: Priority;
  }

  const { priority }: Props = $props();

  const COLUMNS = [0, 5, 10];
  const ROWS = [10, 5, 0];

  const level = $derived(
    { urgent: 3, high: 3, medium: 2, low: 1, none: 0 }[priority],
  );

  // A staircase of pixels: column i is i + 1 pixels tall. Urgent fills the
  // whole 3x3 grid instead so it reads as a different shape, not just a colour.
  const pixels = $derived(
    COLUMNS.flatMap((x, col) =>
      ROWS.filter((_, row) => priority === "urgent" || row <= col).map(y => ({
        x,
        y,
        filled: priority === "urgent" || col < level,
      })),
    ),
  );

  const fill = $derived(
    priority === "urgent"
      ? "var(--color-feedback-error-fill)"
      : "var(--color-text-secondary)",
  );
</script>

<svg
  width="14"
  height="14"
  viewBox="0 0 14 14"
  shape-rendering="crispEdges"
  style:flex-shrink="0"
  aria-hidden="true">
  {#each pixels as pixel (`${pixel.x}-${pixel.y}`)}
    <rect
      x={pixel.x}
      y={pixel.y}
      width="4"
      height="4"
      fill={pixel.filled ? fill : "var(--color-surface-strong)"} />
  {/each}
</svg>
