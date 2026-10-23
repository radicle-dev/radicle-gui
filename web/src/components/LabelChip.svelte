<script lang="ts">
  interface Props {
    label: string;
  }

  const { label }: Props = $props();

  // Labels with a settled meaning keep their colour; any other label gets one
  // of the accent hues picked from its name, so it's stable and labels spread
  // across the palette.
  const known: Record<string, string> = {
    bug: "semantic-red",
    perf: "semantic-amber",
    question: "semantic-amber",
    enhancement: "semantic-blue",
    docs: "semantic-green",
    "good-first-issue": "semantic-green",
  };
  const accents = ["purple", "cyan", "pink", "emerald", "citrus", "blue", "olive", "green"].map(h => `accent-${h}`);

  function hash(s: string): number {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
  }

  // Boards keep priority as a `priority:<level>` label.
  const priority = $derived(label.startsWith("priority:") ? label.slice("priority:".length) : undefined);
  const hue = $derived(
    priority === "urgent" ? "semantic-red" : (known[label] ?? accents[hash(label) % accents.length]),
  );
  const text = $derived(priority ? `${priority[0].toUpperCase()}${priority.slice(1)} priority` : label);
</script>

<style>
  span {
    display: inline-flex;
    align-items: center;
    height: 1.25rem;
    padding: 0 0.4375rem;
    border-radius: var(--border-radius-full);
    font: var(--txt-body-s-medium);
    white-space: nowrap;
    /* A soft tint of the hue behind text mixed from the hue and the page's
       text colour, so it reads in both themes. */
    background: color-mix(in srgb, var(--hue) 16%, transparent);
    color: color-mix(in srgb, var(--hue) 55%, var(--color-text-primary));
  }
</style>

<span style:--hue={`var(--color-${hue}-500)`}>{text}</span>
