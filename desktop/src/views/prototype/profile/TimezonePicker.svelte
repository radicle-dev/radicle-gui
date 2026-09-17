<script lang="ts">
  import fuzzysort from "fuzzysort";

  import Button from "@app/components/Button.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    value: string;
  }

  let { value = $bindable("") }: Props = $props();

  // Every IANA zone, so the answer is never "none of these six".
  const zones: string[] = (() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return ["UTC"];
    }
  })();

  const detected: string | undefined = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return undefined;
    }
  })();

  let filter = $state("");
  let expanded = $state(false);

  // The Etc/GMT zones are fixed offsets rather than places, so they sit after
  // the real ones instead of interleaving with them.
  function isOffset(zone: string): boolean {
    return zone.startsWith("Etc/");
  }

  // Shown without the "Etc/" prefix, which means nothing to anyone.
  function label(zone: string): string {
    return isOffset(zone) ? zone.slice("Etc/".length) : zone;
  }

  function offsetsLast(list: string[]): string[] {
    return [...list.filter(z => !isOffset(z)), ...list.filter(isOffset)];
  }

  // Every zone, with the detected one first so it is one click away.
  const results = $derived.by(() => {
    const matched = filter.trim()
      ? fuzzysort.go(filter, zones, { all: false }).map(r => r.target)
      : [...zones].sort((a, b) => a.localeCompare(b));
    const ordered = offsetsLast(matched);
    return detected && ordered.includes(detected)
      ? [detected, ...ordered.filter(zone => zone !== detected)]
      : ordered;
  });

  // Built once. Formatting inside the render would mean a formatter per zone
  // per pass, and writing a cache from there would be writing state while
  // reading it.
  const times: Record<string, string> = Object.fromEntries(
    zones.flatMap(zone => {
      try {
        return [
          [
            zone,
            new Intl.DateTimeFormat(undefined, {
              timeStyle: "short",
              timeZone: zone,
            }).format(new Date()),
          ],
        ];
      } catch {
        return [];
      }
    }),
  );

  function localTime(zone: string): string | undefined {
    return zone ? times[zone] : undefined;
  }

  function pick(zone: string) {
    value = zone;
    filter = "";
    closeFocused();
  }
</script>

<style>
  .control {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }
  .control > :global(:first-child) {
    flex: 1;
    min-width: 0;
  }
  .clear-icon {
    display: flex;
    color: var(--color-text-tertiary);
  }
  .trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-width: 0;
  }
  .trigger-value {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .trigger-time {
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }
  .chip {
    flex-shrink: 0;
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .placeholder {
    flex: 1;
    color: var(--color-text-tertiary);
  }
  .panel {
    display: flex;
    flex-direction: column;
    width: 20rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
  }
  .search {
    padding: 0.5rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .list {
    max-height: 16rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-width: 0;
  }
  .zone {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .time {
    margin-left: auto;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }
  .empty {
    padding: 0.75rem;
    color: var(--color-text-tertiary);
  }
</style>

<div class="control">
  <Popover
    popoverPadding="0"
    placement="bottom-start"
    styleDisplay="flex"
    bind:expanded>
    {#snippet toggle(onclick)}
      <Button
        variant="outline"
        bordered
        {onclick}
        styleWidth="100%"
        styleJustifyContent="flex-start">
        <span class="trigger">
          <Icon name="clock" />
          {#if value}
            <span class="trigger-value">{label(value)}</span>
            {#if localTime(value)}
              <span class="trigger-time">{localTime(value)}</span>
            {/if}
          {:else}
            <span class="placeholder">Not set</span>
          {/if}
          <Icon name={expanded ? "chevron-up" : "chevron-down"} />
        </span>
      </Button>
    {/snippet}

    {#snippet popover()}
      <div class="panel">
        <div class="search">
          <TextInput
            autofocus
            bind:value={filter}
            placeholder="Search time zones"
            styleHeight="1.75rem" />
        </div>

        {#if results.length > 0}
          <ScrollArea style="max-height: 16rem;">
            <div class="list">
              {#each results as zone (zone)}
                <DropdownListItem
                  styleWidth="100%"
                  selected={value === zone}
                  onclick={() => pick(zone)}>
                  <span class="row txt-body-m-regular">
                    <span class="zone">{label(zone)}</span>
                    {#if zone === detected}
                      <span class="chip txt-body-m-medium">Detected</span>
                    {/if}
                    <span class="time">{localTime(zone)}</span>
                  </span>
                </DropdownListItem>
              {/each}
            </div>
          </ScrollArea>
        {:else}
          <div class="empty txt-body-m-regular">No matching time zones</div>
        {/if}
      </div>
    {/snippet}
  </Popover>

  {#if value}
    <Button
      variant="naked"
      title="Clear time zone"
      onclick={() => (value = "")}>
      <span class="clear-icon"><Icon name="close" /></span>
    </Button>
  {/if}
</div>
