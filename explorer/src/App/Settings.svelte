<script lang="ts">
  import type { BaseUrl } from "@http-client";

  import { HttpdClient } from "@http-client";
  import {
    codeFont,
    codeFonts,
    theme,
    followSystemTheme,
    loadTheme,
  } from "@app/lib/appearance";
  import { searchSeed } from "@app/views/nodes/SeedSelector";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import SeedPicker from "@app/views/explore/SeedPicker.svelte";

  function seedKey(seed: BaseUrl): string {
    return `${seed.scheme}://${seed.hostname}:${seed.port}`;
  }

  // Whether the selected seed exposes the search backend (drives the callout).
  let seedSearchAvailable: boolean | undefined = undefined;
  $: void checkSeedSearch($searchSeed);

  async function checkSeedSearch(seed: BaseUrl) {
    const key = seedKey(seed);
    seedSearchAvailable = undefined;
    try {
      const info = await new HttpdClient(seed).getInfo();
      if (seedKey($searchSeed) === key) {
        seedSearchAvailable = info.httpd.searchAvailable;
      }
    } catch {
      if (seedKey($searchSeed) === key) {
        seedSearchAvailable = false;
      }
    }
  }
</script>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    font: var(--txt-body-m-regular);
  }

  .item {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 2rem;
    white-space: nowrap;
  }

  .right {
    display: flex;
    margin-left: auto;
  }

  .seed-setting {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .seed-setting-row {
    display: flex;
    align-items: center;
    gap: 2rem;
    white-space: nowrap;
  }
  .description {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    white-space: normal;
    max-width: 20rem;
  }
  .callout {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-feedback-warning-bg);
    color: var(--color-feedback-warning-text);
    font: var(--txt-body-s-regular);
    white-space: normal;
  }
  .callout :global(svg) {
    flex-shrink: 0;
    margin-top: 0.125rem;
  }
</style>

<div class="settings">
  <div class="seed-setting">
    <div class="seed-setting-row">
      <div>Search seed</div>
      <div class="right">
        <SeedPicker
          baseUrl={$searchSeed}
          mode="search"
          variant="panel"
          ariaLabel="Search seed selector"
          title="Switch the seed used for search and explore" />
      </div>
    </div>
    <div class="description">
      The seed node used for exploring and searching the network.
    </div>
    {#if seedSearchAvailable === false}
      <div class="callout">
        <Icon name="warning" />
        <span>
          This seed doesn’t have the search backend enabled, so repository
          search is unavailable.
        </span>
      </div>
    {/if}
  </div>
  <div class="item">
    <div>Theme</div>
    <div class="right" style:display="flex" style:gap="0.25rem">
      <Button
        ariaLabel="Light Mode"
        styleBorderRadius="0"
        variant={!$followSystemTheme && $theme === "light"
          ? "gray"
          : "background"}
        on:click={() => {
          theme.set("light");
          followSystemTheme.set(false);
        }}>
        Light
      </Button>
      <Button
        ariaLabel="Dark Mode"
        styleBorderRadius="0"
        variant={!$followSystemTheme && $theme === "dark"
          ? "gray"
          : "background"}
        on:click={() => {
          theme.set("dark");
          followSystemTheme.set(false);
        }}>
        Dark
      </Button>
      <Button
        ariaLabel="System Theme"
        styleBorderRadius="0"
        variant={$followSystemTheme ? "gray" : "background"}
        on:click={() => {
          theme.set(loadTheme());
          followSystemTheme.set(true);
        }}>
        System
      </Button>
    </div>
  </div>
  <div class="item">
    <div>Code Font</div>
    <div class="right" style:display="flex" style:gap="0.25rem">
      {#each codeFonts as font}
        <Button
          ariaLabel={`Code Font ${font.displayName}`}
          styleBorderRadius="0"
          styleFontFamily={font.fontFamily}
          on:click={() => codeFont.set(font.storedName)}
          variant={$codeFont === font.storedName ? "gray" : "background"}>
          {font.displayName}
        </Button>
      {/each}
    </div>
  </div>
</div>
