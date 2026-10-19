<script lang="ts">
  import { copy, shortId } from "@app/lib/utils";

  import Icon from "./Icon.svelte";

  interface Props {
    id: string;
    label: string;
    grouped?: boolean;
  }

  const { id, label, grouped = false }: Props = $props();
  let copied = $state(false);
</script>

<style>
  .value {
    font: var(--txt-code-regular);
  }
  .hover {
    display: none;
  }
  button:hover .default {
    display: none;
  }
  button:hover .hover {
    display: inline-flex;
  }
  .default,
  .hover {
    align-items: center;
  }
  .default {
    display: inline-flex;
  }
</style>

<button
  class="chip"
  style:border={grouped ? "0" : undefined}
  title={copied ? "Copied to clipboard" : `Copy ${label}`}
  onclick={() => {
    copy(id);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }}>
  {#if copied}
    <Icon name="checkmark" />
  {:else}
    <span class="default"><Icon name="hash" /></span>
    <span class="hover"><Icon name="copy" /></span>
  {/if}
  <span class="value">{shortId(id)}</span>
</button>
