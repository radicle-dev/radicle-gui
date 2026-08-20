<script lang="ts">
  import type { ComponentProps } from "svelte";

  import { pluralize } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";

  interface Props {
    clear: () => void;
    count: number;
    icon?: ComponentProps<typeof Icon>["name"];
    matching?: boolean;
    subject?: string;
    triggerLabel?: string;
  }

  const {
    clear,
    count,
    icon = "clear-all",
    matching = false,
    subject,
    triggerLabel,
  }: Props = $props();

  let closed: boolean = $state(true);

  const suffix = $derived(subject ? ` ${subject}` : "");

  const label = $derived(
    matching
      ? count === 1
        ? `Delete 1 match${suffix}`
        : `Delete ${count} matches${suffix}`
      : `Delete ${count}${suffix}`,
  );

  const tooltip = $derived(
    matching
      ? `Delete ${count} matching ${pluralize("notification", count)}${suffix}`
      : `Delete ${count} ${pluralize("notification", count)}${suffix}`,
  );
</script>

{#if count > 0}
  {#if closed}
    <Button
      variant="naked"
      styleWidth={triggerLabel ? undefined : "2rem"}
      stylePadding={triggerLabel ? "0 0.5rem" : "0"}
      title={tooltip}
      onclick={() => (closed = false)}>
      <Icon name={icon} />
      {#if triggerLabel}
        {triggerLabel}
      {/if}
    </Button>
  {:else}
    <div class="global-flex txt-body-m-regular">
      <div class="global-flex" style:justify-content="space-between">
        <Button variant="ghost" onclick={clear}>
          <Icon name={icon} />
          {label}
        </Button>
        <Button
          variant="outline"
          title="Keep these notifications"
          onclick={() => (closed = true)}>
          <Icon name="close" />Cancel
        </Button>
      </div>
    </div>
  {/if}
{/if}
