<script lang="ts">
  import type { Snippet } from "svelte";

  import Icon from "@app/components/Icon.svelte";
  import RadicleWordmark from "@app/components/RadicleWordmark.svelte";

  interface Props {
    children: Snippet;
  }

  const { children }: Props = $props();
</script>

<style>
  .window {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .titlebar {
    height: 2.5rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-app-region: drag;
  }
  .titlebar :global(svg) {
    height: 1rem;
    width: auto;
    pointer-events: none;
  }
  .layout {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-height: 0;
  }
  .hero {
    overflow: hidden;
  }
  .hero img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 77%;
    display: block;
  }
  .panel {
    display: grid;
    place-items: center;
    padding: 2rem;
    overflow-y: auto;
  }
  .inner {
    width: 100%;
    max-width: 22rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-bottom: 2rem;
  }
  .logo {
    display: flex;
    justify-content: center;
  }
  .logo :global(svg) {
    width: 6rem;
    height: auto;
  }
</style>

<div class="window">
  <div class="titlebar" data-tauri-drag-region>
    <RadicleWordmark />
  </div>
  <div class="layout">
    <div class="hero">
      <img src="/flower.png" alt="" />
    </div>
    <div class="panel">
      <div class="inner">
        <div class="logo">
          <Icon name="logo" size="32" />
        </div>
        {@render children()}
      </div>
    </div>
  </div>
</div>
