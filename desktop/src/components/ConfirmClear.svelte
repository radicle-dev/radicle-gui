<script lang="ts">
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";

  interface Props {
    clear: () => void;
    count: number;
    matching?: boolean;
  }

  const { clear, count, matching = false }: Props = $props();

  let closed: boolean = $state(true);

  const label = $derived(
    matching
      ? count === 1
        ? "Delete 1 match"
        : `Delete ${count} matches`
      : `Delete ${count}`,
  );
</script>

{#if count > 0}
  {#if closed}
    <Button
      variant="naked"
      stylePadding="0 0.25rem"
      onclick={() => (closed = false)}>
      <Icon name="clear-all" />
    </Button>
  {:else}
    <div class="global-flex txt-body-m-regular">
      <div class="global-flex" style:justify-content="space-between">
        <Button variant="ghost" onclick={clear}>
          <Icon name="clear-all" />
          {label}
        </Button>
        <Button variant="outline" onclick={() => (closed = true)}>
          <Icon name="close" />Cancel
        </Button>
      </div>
    </div>
  {/if}
{/if}
