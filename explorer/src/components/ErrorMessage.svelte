<script lang="ts">
  import type { ComponentProps } from "svelte";
  import type { ErrorParam } from "@app/lib/router/definitions";

  import config from "@app/lib/config";
  import Command from "./Command.svelte";
  import ExternalLink from "./ExternalLink.svelte";
  import IconLarge from "./IconLarge.svelte";

  export let title: string;
  export let description: string;
  export let error: ErrorParam = undefined;
  export let icon: ComponentProps<IconLarge>["name"] = "alert";
  // An optional seed address shown below the description, e.g. the node the
  // failed request targeted. Rendered as plain text, never as markup.
  export let seed: string | undefined = undefined;
</script>

<style>
  .error {
    align-items: center;
    border-radius: inherit;
    display: flex;
    flex-direction: column;
    font-size: inherit;
    padding: 1rem;
    border-radius: var(--border-radius-md);
    gap: 1rem;
  }
  .label {
    font: var(--txt-body-m-regular);
    max-width: 36rem;
    white-space: pre-line;
  }
  .error code {
    font: var(--txt-code-regular);
    background-color: var(--color-surface-mid);
    border-radius: var(--border-radius-sm);
    padding: 0.125rem 0.25rem;
  }

  .help {
    font: var(--txt-body-m-regular);
    text-align: center;
  }
  .command {
    max-width: 25rem;
  }
  @media (max-width: 719.98px) {
    .command {
      max-width: 20rem;
    }
  }
</style>

<div class="error">
  <IconLarge name={icon} />
  <div class="txt-heading-m">
    {title}
  </div>
  <div class="label">{description}</div>
  {#if seed}
    <div class="label"><code>{seed}</code></div>
  {/if}
  {#if error}
    <div class="help">
      If you need help resolving this issue, copy the error message
      <br class="global-hide-on-mobile-down" />
      below and send it to us on
      <ExternalLink href={config.supportWebsite}>
        {config.supportWebsite}
      </ExternalLink>
    </div>
    <div class="command">
      <Command
        command={JSON.stringify(error, Object.getOwnPropertyNames(error))}
        fullWidth
        showPrompt={false} />
    </div>
  {/if}
</div>
