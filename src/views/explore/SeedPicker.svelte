<script lang="ts">
  import type { BaseUrl } from "@http-client";

  import isEqual from "lodash/isEqual";
  import { get } from "svelte/store";

  import config from "@app/lib/config";
  import { HttpdClient, ResponseError } from "@http-client";
  import {
    activeUnloadedRouteStore,
    push,
    routeBaseUrl,
    withBaseUrl,
  } from "@app/lib/router";
  import { isLocal, isOnion } from "@app/lib/utils";
  import {
    addBookmark,
    bookmarkedSeeds,
    clearSeedFailure,
    failedSeeds,
    removeBookmark,
    explicitSeed,
  } from "@app/views/nodes/SeedSelector";
  import { closeFocused } from "@app/components/Popover.svelte";

  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownList/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IconButton from "@app/components/IconButton.svelte";
  import Popover from "@app/components/Popover.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  export let baseUrl: BaseUrl;
  // What picking a seed applies to:
  //   "node"   — move the current page onto the seed, changing the URL.
  //   "search" — set the stored search seed, leaving the page where it is.
  // Required, so every call site has to say which of the two it means.
  export let mode: "node" | "search";
  export let ariaLabel = "Seed selector";
  export let title = "Switch seed";
  // Where the picker sits. A breadcrumb sits on the left of the header, so
  // its popover is anchored to the toggle's left edge instead of its right.
  export let variant: "header" | "breadcrumb" | "panel" = "header";

  const VALIDATION_TIMEOUT_MS = 10000;

  // The seed currently in use isn't necessarily bookmarked or a default: it
  // can be reached through a shared link or through failover. List it anyway,
  // so it is always possible to open its node view from here.
  $: isListed =
    $bookmarkedSeeds.some(s => isEqual(s, baseUrl)) ||
    config.preferredSeeds.some(s => isEqual(s, baseUrl));
  $: customSeeds = isListed ? $bookmarkedSeeds : [...$bookmarkedSeeds, baseUrl];

  let expanded: boolean = false;
  let loading = false;
  let addingNew = false;
  let seedAddressInput: string = "";
  let validationMessage: string | undefined = undefined;

  $: if (expanded === false) {
    validationMessage = "";
    addingNew = false;
    seedAddressInput = "";
  }

  function beginAdd() {
    validationMessage = undefined;
    seedAddressInput = "";
    addingNew = true;
  }

  async function validateInput(seed: BaseUrl): Promise<string | undefined> {
    const api = new HttpdClient(seed);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
    try {
      await api.getNode({ abort: controller.signal });
    } catch (e) {
      console.warn(e);
      return "Seed node isn’t reachable";
    } finally {
      clearTimeout(timer);
    }
  }

  // Probe a seed to decide if it's reachable. Mirrors the reachability
  // check in `tryWithFailover`: prefer `/info`, only swallow 404/405 (older
  // httpd) and try `/node` instead. Any other error → not reachable.
  async function probeSeed(seed: BaseUrl): Promise<boolean> {
    const api = new HttpdClient(seed);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
    try {
      try {
        await api.getInfo({ abort: controller.signal });
        return true;
      } catch (error) {
        if (
          error instanceof ResponseError &&
          (error.status === 404 || error.status === 405)
        ) {
          await api.getNode({ abort: controller.signal });
          return true;
        }
        throw error;
      }
    } catch (e) {
      console.warn(`Probe for seed ${seed.hostname} failed:`, e);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  function parseInputToBaseUrl(input: string): BaseUrl | undefined {
    if (!input) return undefined;
    const [hostname, portString] = input.split(":");
    if (!hostname) return undefined;
    let port: number;
    if (portString !== undefined) {
      const parsed = Number(portString);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        return undefined;
      }
      port = parsed;
    } else {
      port = isLocal(hostname)
        ? config.nodes.defaultLocalHttpdPort
        : config.nodes.defaultHttpdPort;
    }
    const scheme =
      isLocal(hostname) || isOnion(hostname)
        ? "http"
        : config.nodes.defaultHttpdScheme;
    return { hostname, port, scheme };
  }

  async function applySeed(seed: BaseUrl) {
    const isDefault = config.preferredSeeds.some(s => isEqual(s, seed));
    const isBookmarked = get(bookmarkedSeeds).some(s => isEqual(s, seed));
    if (!isDefault && !isBookmarked) {
      addBookmark(seed);
    }
    closeFocused();

    const route = get(activeUnloadedRouteStore);

    if (mode === "node" && routeBaseUrl(route) !== undefined) {
      // Rewrite the route's baseUrl-bearing field so we retry the same
      // logical page (repo, user, node) on the new node — important for
      // pages opened via a hardcoded node URL such as the "node
      // unreachable" error view.
      await push(withBaseUrl(route, seed));
      return;
    }

    // Either the picker is setting the search seed, or it's in node mode on a
    // route whose URL names no node to switch (explore). Both come down to the
    // same thing: the search seed is the only node such a page reads.
    explicitSeed.set(seed);
    // Leave the current page where it is; only the explore listing reloads,
    // since it's the one view served by the search seed. Keyed off the
    // unloaded route rather than the loaded one, because a failed listing
    // loads as an `error` — exactly when the user is switching seeds.
    if (route.resource === "explore" || route.resource === "explore.repos") {
      await push(route);
    }
  }

  async function submitSeed() {
    loading = true;
    const seed = parseInputToBaseUrl(seedAddressInput.trim());
    if (!seed) {
      validationMessage = "Enter a valid hostname or hostname:port";
      loading = false;
      return;
    }
    validationMessage = await validateInput(seed);
    if (validationMessage === undefined) {
      if (!isEqual(baseUrl, seed)) {
        await applySeed(seed);
      } else {
        closeFocused();
      }
    }
    loading = false;
  }

  async function selectSeed(seed: BaseUrl) {
    if (isEqual(baseUrl, seed)) {
      closeFocused();
      return;
    }
    // If the clicked seed is currently marked unreachable, give it a fresh
    // probe before navigating. On success the mark is cleared so the route
    // loader treats it as the primary; on failure the mark stays in place
    // and the loader's failover picks a reachable seed instead.
    if (get(failedSeeds).some(s => isEqual(s, seed))) {
      if (await probeSeed(seed)) {
        clearSeedFailure(seed);
      }
    }
    await applySeed(seed);
  }

  function openNodeView(seed: BaseUrl) {
    closeFocused();
    void push({
      resource: "nodes",
      params: { baseUrl: seed, repoPageIndex: 0 },
    });
  }

  function isSeedFailed(seed: BaseUrl, failed: BaseUrl[]) {
    return failed.some(s => isEqual(s, seed));
  }

  function isBookmarked(seed: BaseUrl, bookmarks: BaseUrl[]) {
    return bookmarks.some(s => isEqual(s, seed));
  }

  function handleEscape(event: KeyboardEvent) {
    if (expanded && event.key === "Escape") {
      closeFocused();
    }
  }
</script>

<style>
  .target {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.375rem;
    max-width: 14rem;
    padding: 0.375rem 0;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
  }
  .target.breadcrumb {
    padding: 0.375rem 0.5rem;
    color: var(--color-text-primary);
  }
  .target.panel {
    padding: 0.375rem 0.5rem;
  }
  .target:hover {
    background-color: var(--color-surface-mid);
    color: var(--color-text-primary);
  }
  .hostname {
    font: var(--txt-body-m-regular);
  }
  .validation-message {
    color: var(--color-feedback-error-text);
    margin: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .popover-content {
    min-width: 16rem;
    display: flex;
    flex-direction: column;
  }
  .section-label {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    margin: 0.5rem 0.5rem 0.25rem;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }
  .add-new-row {
    padding: 0.25rem 0.25rem 0 0.25rem;
  }
  .add-new {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    height: 2.5rem;
    padding: 0.5rem 0.375rem;
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    text-align: left;
  }
  .add-new:hover {
    background-color: var(--color-surface-mid);
    color: var(--color-text-primary);
  }
  .add-new-input {
    padding: 0.25rem 0.25rem 0 0.25rem;
  }
  .failed-icon {
    display: inline-flex;
    align-items: center;
    color: var(--color-feedback-warning-text);
  }
</style>

<svelte:window on:keydown={handleEscape} />

<Popover
  bind:expanded
  popoverPositionTop="2.5rem"
  popoverPositionLeft={variant === "breadcrumb" ? "0" : undefined}
  popoverPositionRight={variant === "breadcrumb" ? undefined : "0"}
  popoverPadding="0.25rem"
  popoverBorderRadius="var(--border-radius-md)">
  <div
    slot="toggle"
    let:toggle
    class="target {variant}"
    {title}
    aria-label={ariaLabel}
    on:click={toggle}
    on:keydown={e => e.key === "Enter" && toggle()}
    role="button"
    tabindex="0"
    aria-haspopup="dialog"
    aria-expanded={expanded}>
    <slot name="icon"><Icon name="seed" /></slot>
    <div class="hostname txt-overflow">{baseUrl.hostname}</div>
    {#if variant !== "breadcrumb"}
      <Icon name={expanded ? "chevron-up" : "chevron-down"} />
    {/if}
  </div>

  <svelte:fragment slot="popover">
    <div class="popover-content">
      <div class="section-label">Custom seeds</div>
      {#if customSeeds.length > 0}
        <DropdownList items={customSeeds} styleDropdownPadding="0">
          <DropdownListItem
            slot="item"
            let:item
            style="height: 2.5rem"
            on:click={() => void selectSeed(item)}
            selected={isEqual(baseUrl, item)}>
            <div class="item">
              <Icon name="seed" />
              <div class="txt-overflow" style:flex="1">{item.hostname}</div>
              {#if isSeedFailed(item, $failedSeeds)}
                <span class="failed-icon" title="Unable to reach seed">
                  <Icon name="warning" />
                </span>
              {/if}
              <div class="actions">
                <IconButton
                  ariaLabel="Open node view"
                  title="Open node view"
                  stopPropagation
                  on:click={() => openNodeView(item)}>
                  <Icon name="arrow-right" />
                </IconButton>
                {#if isBookmarked(item, $bookmarkedSeeds)}
                  <IconButton
                    ariaLabel="Remove bookmark"
                    stopPropagation
                    on:click={() => removeBookmark(item)}>
                    <Icon name="close" />
                  </IconButton>
                {:else}
                  <IconButton
                    ariaLabel="Bookmark seed"
                    title="Bookmark seed"
                    stopPropagation
                    on:click={() => addBookmark(item)}>
                    <Icon name="plus" />
                  </IconButton>
                {/if}
              </div>
            </div>
          </DropdownListItem>
        </DropdownList>
      {/if}

      {#if addingNew}
        <div class="add-new-input">
          <TextInput
            autofocus
            autoselect
            bind:value={seedAddressInput}
            name="seed"
            placeholder="seed.radicle.example"
            {loading}
            on:submit={submitSeed} />
        </div>
        {#if validationMessage}
          <span class="validation-message txt-body-s-regular">
            {validationMessage}
          </span>
        {/if}
      {:else}
        <div class="add-new-row">
          <button type="button" class="add-new" on:click={beginAdd}>
            <Icon name="plus" />
            <span>Add new</span>
          </button>
        </div>
      {/if}

      <div style:padding-top="0.5rem">
        {#if config.preferredSeeds.length > 0}
          <div class="section-label">Default seeds</div>
          <DropdownList items={config.preferredSeeds}>
            <DropdownListItem
              style="height: 2.5rem"
              on:click={() => void selectSeed(item)}
              slot="item"
              selected={isEqual(baseUrl, item)}
              let:item>
              <div class="item">
                <Icon name="seed" />
                <div class="txt-overflow" style:flex="1">{item.hostname}</div>
                {#if isSeedFailed(item, $failedSeeds)}
                  <span class="failed-icon" title="Unable to reach seed">
                    <Icon name="warning" />
                  </span>
                {/if}
                <IconButton
                  ariaLabel="Open node view"
                  title="Open node view"
                  stopPropagation
                  on:click={() => openNodeView(item)}>
                  <Icon name="arrow-right" />
                </IconButton>
              </div>
            </DropdownListItem>
          </DropdownList>
        {/if}
      </div>
    </div>
  </svelte:fragment>
</Popover>
