<script lang="ts">
  import type { Comment } from "@http-client";

  export let reactions: Comment["reactions"];

  function authorsToTooltip(authors: Comment["reactions"][0]["authors"]) {
    return authors.map(a => a.alias ?? a.id).join("\n");
  }
</script>

<style>
  .reactions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .reaction {
    display: inline-flex;
    flex-direction: row;
    gap: 0.5rem;
  }
</style>

<div class="reactions">
  {#each reactions as { emoji, authors }}
    <div title={authorsToTooltip(authors)}>
      <div class="reaction txt-body-s-regular" style="padding: 2px 4px;">
        <span>{emoji}</span>
        <span>{authors.length}</span>
      </div>
    </div>
  {/each}
</div>
