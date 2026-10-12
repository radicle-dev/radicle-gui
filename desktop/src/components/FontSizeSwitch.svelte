<script lang="ts">
  import {
    decreaseFontSize,
    fontSettings,
    increaseFontSize,
  } from "@app/lib/appearance.svelte";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
</script>

<style>
</style>

<div class="global-flex" style:gap="0">
  <Button
    variant="ghost"
    flatRight
    onclick={() => {
      decreaseFontSize();
    }}>
    <Icon name="minus" />
  </Button>

  <Button variant="ghost" flatRight flatLeft active>
    {fontSettings.size}
  </Button>

  <Button
    variant="ghost"
    flatLeft
    onclick={() => {
      increaseFontSize();
    }}>
    <Icon name="plus" />
  </Button>
</div>
