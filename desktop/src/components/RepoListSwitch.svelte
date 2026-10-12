<script lang="ts">
  import { repoListScope } from "@app/lib/repoListScope";

  import Button from "@app/components/Button.svelte";
</script>

<style>
  .container {
    display: flex;
    align-items: center;
  }
</style>

<div class="container">
  <Button
    variant="ghost"
    flatRight
    active={repoListScope.value === "seeded"}
    onclick={() => (repoListScope.value = "seeded")}>
    Seeded
  </Button>

  <Button
    variant="ghost"
    flatLeft
    active={repoListScope.value === "all"}
    onclick={() => (repoListScope.value = "all")}>
    All
  </Button>
</div>
