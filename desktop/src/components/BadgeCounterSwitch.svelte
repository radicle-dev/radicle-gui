<script lang="ts" module>
  import { writable } from "svelte/store";

  function loadBadgeCounter(): boolean {
    const stored = localStorage ? localStorage.getItem("badgeCounter") : null;
    return stored === null ? true : stored === "true";
  }

  export const badgeCounter = writable<boolean>(loadBadgeCounter());

  export function storeBadgeCounter(enabled: boolean): void {
    badgeCounter.set(enabled);
    if (localStorage) {
      localStorage.setItem("badgeCounter", enabled.toString());
    }
  }
</script>

<script lang="ts">
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
    active={$badgeCounter}
    onclick={() => storeBadgeCounter(true)}>
    Show
  </Button>
  <Button
    variant="ghost"
    flatLeft
    active={!$badgeCounter}
    onclick={() => storeBadgeCounter(false)}>
    Hide
  </Button>
</div>
