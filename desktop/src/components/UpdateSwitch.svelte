<script lang="ts">
  import Button from "@app/components/Button.svelte";

  interface Props {
    active: boolean;
    enable: () => void;
    disable: () => void;
  }

  const { active, enable, disable }: Props = $props();
</script>

<style>
  .container {
    display: flex;
    align-items: center;
  }
</style>

<div class="container">
  <Button variant="ghost" flatRight active={!active} onclick={disable}>
    Disable
  </Button>

  <Button variant="ghost" flatLeft active={Boolean(active)} onclick={enable}>
    Enable
  </Button>
</div>
