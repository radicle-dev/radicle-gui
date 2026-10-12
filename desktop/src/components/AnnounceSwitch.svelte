<script lang="ts" module>
  export const announce = writable<boolean>(loadAnnounce());

  function loadAnnounce(): boolean {
    const storedAnnounce = localStorage
      ? localStorage.getItem("announce")
      : null;

    if (storedAnnounce === null) {
      return true;
    } else {
      return storedAnnounce === "true";
    }
  }

  export function storeAnnounce(newAnnounce: boolean): void {
    announce.set(newAnnounce);
    if (localStorage) {
      localStorage.setItem("announce", newAnnounce.toString());
    } else {
      console.warn(
        "localStorage isn't available, not able to persist the selected announce preference without it.",
      );
    }
  }
</script>

<script lang="ts">
  import { writable } from "svelte/store";

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
    active={$announce}
    onclick={() => {
      storeAnnounce(true);
    }}>
    Right away
  </Button>

  <Button
    variant="ghost"
    flatLeft
    active={!$announce}
    onclick={() => {
      storeAnnounce(false);
    }}>
    Periodically
  </Button>
</div>
