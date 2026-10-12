<script lang="ts">
  import type { ErrorWrapper } from "@bindings/error/ErrorWrapper";
  import type { Snippet } from "svelte";

  import Command from "@app/components/Command.svelte";
  import ExternalLink from "@app/components/ExternalLink.svelte";
  import Icon from "@app/components/Icon.svelte";

  const {
    title = "An error occurred",
    children,
    error,
  }: { title?: string; children?: Snippet; error?: ErrorWrapper } = $props();
</script>

<style>
  .error-container {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
  }

  .error-icon {
    color: var(--color-text-secondary);
    margin-bottom: 1rem;
  }

  .error-title {
    font: var(--txt-heading-l);
    margin: 0 0 0.75rem 0;
  }

  .error-support {
    padding: 0 2rem;
    margin-bottom: 0;
  }
</style>

<div class="error-container txt-body-m-regular">
  <div
    style:border="1px solid var(--color-border-subtle)"
    style:border-radius="var(--border-radius-sm)"
    style:display="flex"
    style:gap="0.5rem"
    style:align-items="center"
    style:background-color="var(--color-surface-canvas)"
    style:max-width="45rem"
    style:justify-content="center"
    style:flex-direction="column"
    style:padding="1.5rem">
    <div class="error-icon">
      <Icon size="32" name="warning" />
    </div>

    <h2 class="error-title">{title}</h2>

    {#if children}
      <p class="error-support" style:text-align="center">
        {@render children()}
      </p>
    {/if}

    <p class="error-support">
      If this problem persists, please contact
      <ExternalLink
        href="https://radicle.zulipchat.com/#narrow/channel/444463-desktop/topic/support">
        support{error ? " with the error details below." : "."}
      </ExternalLink>
    </p>

    {#if error?.message}
      <Command styleWidth="30rem" showPrompt={false} command={error.message} />
    {/if}
  </div>
</div>
