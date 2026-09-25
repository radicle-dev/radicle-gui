<script lang="ts">
  import type { MatchSegment } from "@http-client";

  import dompurify from "dompurify";
  import escape from "lodash/escape";
  import { sanitizeConfig, titleSanitizeConfig } from "@app/lib/markdown";
  import { formatInlineTitle, highlightSegments } from "@app/lib/utils";

  export let content: string;
  export let segments: MatchSegment[] | undefined = undefined;
  export let fontSize: "body-m-regular" | "body-l-medium" | "heading-l" =
    "body-m-regular";

  $: html = segments?.length
    ? dompurify.sanitize(
        formatInlineTitle(highlightSegments(segments)),
        titleSanitizeConfig,
      )
    : dompurify.sanitize(formatInlineTitle(escape(content)), sanitizeConfig);
</script>

<style>
  .content :global(code) {
    font: var(--txt-code-regular);
    font-size: inherit;
    background-color: var(--color-surface-mid);
    border-radius: var(--border-radius-sm);
    padding: 0.125rem 0.25rem;
  }

  .content :global(mark) {
    background-color: var(--color-surface-alpha-mid);
    color: inherit;
    border-radius: var(--border-radius-xs);
  }
</style>

<span
  class="content"
  class:txt-heading-l={fontSize === "heading-l"}
  class:txt-body-l-medium={fontSize === "body-l-medium"}
  class:txt-body-m-regular={fontSize === "body-m-regular"}>
  {@html html}
</span>
