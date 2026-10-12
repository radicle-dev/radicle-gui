<script lang="ts">
  import dompurify from "dompurify";
  import escape from "lodash/escape";

  import { sanitizeConfig } from "@app/lib/markdown";

  interface Props {
    content: string;
    fontSize?: "tiny" | "small" | "regular" | "medium" | "large";
  }

  const { content, fontSize = "small" }: Props = $props();

  function formatInlineTitle(input: string): string {
    return input
      .replaceAll(/`([^`]+)`/g, "<code>$1</code>")
      .replaceAll(/~~([^~~]+)~~/g, "<del>$1</del>");
  }
</script>

<style>
  .content :global(code) {
    font-family: monospace;
    padding: 0.125rem 0.25rem;
    background-color: var(--color-surface-subtle);
    font-size: inherit;
  }
</style>

<span
  class="content"
  class:txt-heading-l={fontSize === "large"}
  class:txt-heading-m={fontSize === "medium"}
  class:txt-body-l-regular={fontSize === "regular"}
  class:txt-body-m-regular={fontSize === "small"}
  class:txt-body-s-regular={fontSize === "tiny"}>
  {@html dompurify.sanitize(formatInlineTitle(escape(content)), sanitizeConfig)}
</span>
