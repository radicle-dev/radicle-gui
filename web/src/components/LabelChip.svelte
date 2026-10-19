<script lang="ts">
  interface Props {
    label: string;
  }

  const { label }: Props = $props();

  const hues: Record<string, string> = {
    bug: "red",
    perf: "amber",
    enhancement: "blue",
    docs: "green",
    question: "amber",
    "good-first-issue": "green",
  };
  const hue = $derived(hues[label] ?? undefined);
</script>

<style>
  span {
    display: inline-flex;
    align-items: center;
    height: 1.25rem;
    padding: 0 0.4375rem;
    border-radius: var(--border-radius-full);
    font: var(--txt-body-s-medium);
    border: 1px solid var(--color-border-mid);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
</style>

<span
  style:background={hue ? `var(--color-semantic-${hue}-100)` : undefined}
  style:border-color={hue ? `var(--color-semantic-${hue}-300)` : undefined}
  style:color={hue ? `var(--color-semantic-${hue}-800)` : undefined}>
  {label}
</span>
