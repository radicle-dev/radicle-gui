<script lang="ts">
  import Badge from "@app/components/Badge.svelte";

  export let labels: string[];
</script>

<style>
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

{#each labels.slice(0, 2) as label}
  <Badge style="max-width:7rem" variant="neutral">
    <span class="label">{label}</span>
  </Badge>
{/each}
{#if labels.length > 2}
  <Badge title={labels.slice(2, undefined).join(" ")} variant="neutral">
    <span class="label">
      +{labels.length - 2} more
    </span>
  </Badge>
{/if}
