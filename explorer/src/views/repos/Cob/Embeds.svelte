<script lang="ts">
  import type { Embed } from "@http-client";

  import Badge from "@app/components/Badge.svelte";
  import Clipboard from "@app/components/Clipboard.svelte";

  export let embeds: Embed[] = [];
</script>

<style>
  .header {
    font: var(--txt-body-m-regular);
    margin-bottom: 0.75rem;
  }
  .body {
    display: flex;
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
      align-items: flex;
    }
    .header {
      margin-bottom: 0;
      height: 2rem;
      display: flex;
      align-items: center;
    }
    .no-attachments {
      height: 2rem;
      display: flex;
      align-items: center;
    }
  }
</style>

<div class="wrapper">
  <div class="header">Attachments</div>
  <div class="body">
    {#each embeds as embed}
      <Badge variant="neutral" size="small" style="max-width: 14rem;">
        <span class="txt-overflow">{embed.name}</span>
        <Clipboard text={`![${embed.name}](${embed.content.substring(4)})`} />
      </Badge>
    {:else}
      <div class="no-attachments" style:color="var(--color-text-tertiary)">
        No attachments
      </div>
    {/each}
  </div>
</div>
