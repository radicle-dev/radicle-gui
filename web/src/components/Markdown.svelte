<script lang="ts">
  import { renderMarkdown } from "@app/lib/markdown";

  interface Props {
    content: string;
    compact?: boolean;
  }

  const { content, compact = false }: Props = $props();
  const html = $derived(renderMarkdown(content));
</script>

<div class="markdown" class:compact>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html html}
</div>
