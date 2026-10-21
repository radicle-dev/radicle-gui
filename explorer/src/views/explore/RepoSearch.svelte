<script lang="ts">
  import type { BaseUrl, SearchResult } from "@http-client";

  import debounce from "lodash/debounce";
  import { createEventDispatcher, onDestroy, onMount, tick } from "svelte";

  import { HttpdClient } from "@http-client";
  import { push } from "@app/lib/router";
  import { formatRepositoryId, twemoji } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import IconButton from "@app/components/IconButton.svelte";
  import Link from "@app/components/Link.svelte";
  import Loading from "@app/components/Loading.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";

  export let baseUrl: BaseUrl;
  export let autofocus = false;
  export let showClose = false;

  const dispatch = createEventDispatcher<{ close: null }>();

  let query = "";
  let results: SearchResult[] = [];
  let loading = false;
  let open = false;
  let failed = false;
  // Index of the keyboard/hover-highlighted result; -1 means none.
  let activeIndex = -1;
  let containerEl: HTMLDivElement;
  let inputEl: HTMLInputElement | undefined = undefined;
  let controller: AbortController | undefined;

  $: api = new HttpdClient(baseUrl);

  onMount(() => {
    if (autofocus) inputEl?.focus({ preventScroll: true });
  });

  // The inline instance unmounts on every explore→repo navigation, so make
  // sure a pending debounce or in-flight request can't resolve after teardown.
  onDestroy(() => {
    runSearch.cancel();
    controller?.abort();
  });

  // Drop stale state when the active seed changes.
  $: if (baseUrl) reset();

  function reset() {
    runSearch.cancel();
    controller?.abort();
    controller = undefined;
    query = "";
    results = [];
    loading = false;
    open = false;
    failed = false;
    activeIndex = -1;
  }

  const runSearch = debounce((q: string) => {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    api.repo
      .search(q, { abort: current.signal })
      .then(found => {
        if (current.signal.aborted) return;
        results = found.filter(r => r.payloads["xyz.radicle.project"]);
        failed = false;
        loading = false;
      })
      .catch(() => {
        if (current.signal.aborted) return;
        results = [];
        failed = true;
        loading = false;
      });
  }, 200);

  function handleInput() {
    activeIndex = -1;
    const q = query.trim();
    if (q.length === 0) {
      runSearch.cancel();
      controller?.abort();
      controller = undefined;
      results = [];
      loading = false;
      failed = false;
      open = false;
      return;
    }
    loading = true;
    open = true;
    void runSearch(q);
  }

  function handleFocus() {
    if (query.trim().length > 0) open = true;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (open) {
        open = false;
      } else {
        dispatch("close");
      }
      return;
    }

    if (!open || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, results.length - 1);
      void scrollActiveIntoView();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = activeIndex <= 0 ? -1 : activeIndex - 1;
      void scrollActiveIntoView();
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectResult(results[activeIndex]);
    }
  }

  function selectResult(result: SearchResult) {
    void push({ resource: "repo.source", repo: result.rid, node: baseUrl });
    open = false;
    dispatch("close");
  }

  async function scrollActiveIntoView() {
    await tick();
    containerEl
      ?.querySelector(".result.active")
      ?.scrollIntoView({ block: "nearest" });
  }

  function handleWindowClick(event: MouseEvent | TouchEvent) {
    if (open && containerEl && !event.composedPath().includes(containerEl)) {
      open = false;
    }
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
      event.preventDefault();
      inputEl?.focus();
      inputEl?.select();
    }
  }
</script>

<style>
  .search {
    position: relative;
    width: 100%;
  }
  .input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: var(--button-regular-height);
    padding: 0 0.75rem;
    background: var(--color-surface-base);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    color: var(--color-text-tertiary);
  }
  .input-wrapper:hover {
    border-color: var(--color-border-mid);
  }
  .input-wrapper:focus-within {
    border-color: var(--color-border-brand);
    color: var(--color-text-primary);
  }
  .search-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .search-input::placeholder {
    color: var(--color-text-tertiary);
    opacity: 1;
  }
  .dropdown {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    right: 0;
    z-index: 10;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    box-shadow: var(--elevation-low);
    padding: 0.25rem;
    max-height: 24rem;
    overflow-y: auto;
  }
  .dropdown :global(a) {
    text-decoration: none;
    color: inherit;
  }
  .result {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem;
    border-radius: var(--border-radius-sm);
  }
  .result.active {
    background-color: var(--color-surface-subtle);
  }
  .result-avatar {
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-brand-bg);
    color: var(--color-text-on-brand);
    overflow: hidden;
  }
  .result-body {
    flex: 1;
    min-width: 0;
  }
  .result-name {
    font: var(--txt-body-m-semibold);
    color: var(--color-text-primary);
  }
  .result-meta {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .result-description {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .result-rid {
    flex-shrink: 0;
  }
  .result-seeds {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }
  .message {
    padding: 0.75rem 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
</style>

<svelte:window
  on:click={handleWindowClick}
  on:touchstart={handleWindowClick}
  on:keydown={handleWindowKeydown} />

<div class="search" bind:this={containerEl}>
  <div class="input-wrapper">
    <Icon name="search" />
    <input
      class="search-input"
      type="text"
      placeholder="Search repositories…"
      aria-label="Search repositories"
      autocomplete="off"
      spellcheck="false"
      bind:this={inputEl}
      bind:value={query}
      on:input={handleInput}
      on:focus={handleFocus}
      on:keydown|stopPropagation={handleKeydown} />
    {#if loading}
      <Loading small noDelay />
    {/if}
    {#if showClose}
      <IconButton ariaLabel="Close search" on:click={() => dispatch("close")}>
        <Icon name="close" />
      </IconButton>
    {/if}
  </div>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="dropdown" on:mouseleave={() => (activeIndex = -1)}>
      {#if results.length > 0}
        {#each results as result, i (result.rid)}
          {@const project = result.payloads["xyz.radicle.project"]}
          {#if project}
            <Link
              route={{
                resource: "repo.source",
                repo: result.rid,
                node: baseUrl,
              }}
              on:afterNavigate={() => {
                open = false;
                dispatch("close");
              }}>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="result"
                class:active={i === activeIndex}
                on:mouseenter={() => (activeIndex = i)}>
                <div class="result-avatar">
                  <RepoAvatar
                    rid={result.rid}
                    name={project.name}
                    styleWidth="1.5rem" />
                </div>
                <div class="result-body">
                  <div class="result-name txt-overflow" use:twemoji>
                    {project.name}
                  </div>
                  <div class="result-meta">
                    {#if project.description}
                      <span class="result-description" use:twemoji>
                        {project.description}
                      </span>
                    {/if}
                    <span class="result-rid" title={result.rid}>
                      {formatRepositoryId(result.rid)}
                    </span>
                  </div>
                </div>
                <div class="result-seeds txt-body-s-regular">
                  <Icon name="seed" />
                  {result.seeds}
                </div>
              </div>
            </Link>
          {/if}
        {/each}
      {:else if loading}
        <div class="message">Searching…</div>
      {:else if failed}
        <div class="message">Search is unavailable on this seed.</div>
      {:else}
        <div class="message">No repositories found.</div>
      {/if}
    </div>
  {/if}
</div>
