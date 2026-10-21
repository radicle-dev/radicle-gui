<script lang="ts">
  import dompurify from "dompurify";
  import escape from "lodash/escape";
  import { sanitizeConfig } from "@app/lib/markdown";
  import { formatInlineTitle } from "@app/lib/utils";

  export let content: string;
  export let fontSize: "body-m-regular" | "body-l-medium" | "heading-l" =
    "body-m-regular";
</script>

<style>
  .content :global(code) {
    font: var(--txt-code-regular);
    font-size: inherit;
    background-color: var(--color-surface-mid);
    border-radius: var(--border-radius-sm);
    padding: 0.125rem 0.25rem;
  }
</style>

<span
  class="content"
  class:txt-heading-l={fontSize === "heading-l"}
  class:txt-body-l-medium={fontSize === "body-l-medium"}
  class:txt-body-m-regular={fontSize === "body-m-regular"}>
  {@html dompurify.sanitize(formatInlineTitle(escape(content)), sanitizeConfig)}
</span>
