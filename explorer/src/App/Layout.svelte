<script lang="ts">
  import Header from "@app/components/Header.svelte";
</script>

<style>
  .content {
    width: 100%;
    display: grid;
    height: calc(100vh - var(--global-header-height));
  }
  .center {
    overflow-y: auto;
  }
</style>

<Header />
<div class="content">
  <div class="center">
    <slot />
  </div>
</div>
