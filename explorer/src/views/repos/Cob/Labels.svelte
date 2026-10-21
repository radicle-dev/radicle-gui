<script lang="ts">
  import Badge from "@app/components/Badge.svelte";

  export let labels: string[] = [];
</script>

<style>
  .header {
    font: var(--txt-body-m-regular);
    margin-bottom: 0.75rem;
  }
  .body {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    flex-direction: row;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
  }
  @media (max-width: 1349.98px) {
    .wrapper {
      display: flex;
      flex-direction: row;
      gap: 1rem;
      align-items: flex-start;
    }
    .header {
      margin-bottom: 0;
      height: 2rem;
      display: flex;
      align-items: center;
    }
    .body {
      align-items: flex-start;
    }
    .no-labels {
      height: 2rem;
      display: flex;
      align-items: center;
    }
  }
</style>

<div class="wrapper">
  <div class="header">Labels</div>
  <div class="body">
    {#each labels as label}
      <Badge variant="neutral" size="small">
        {label}
      </Badge>
    {:else}
      <div class="no-labels" style:color="var(--color-text-tertiary)">
        No labels
      </div>
    {/each}
  </div>
</div>
