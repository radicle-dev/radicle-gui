<script lang="ts">
  import type { ComponentProps } from "svelte";

  import { reposOn } from "@app/lib/seedContent";
  import { plural } from "@app/lib/utils";
  import { seedLabel } from "@app/lib/exploreSeed.svelte";
  import { node } from "@app/node/node.svelte";
  import { LOCAL_NODE, SEED_NODES } from "@app/node/seedNodes";

  import { nidFor } from "@app/node/hash";

  import Avatar from "./Avatar.svelte";
  import Icon from "./Icon.svelte";
  import UserAvatar from "./UserAvatar.svelte";
  import Popover, { closeFocused } from "./Popover.svelte";

  interface Props {
    value: string;
    onchange: (seed: string) => void;
    placement?: ComponentProps<typeof Popover>["placement"];
    styleZIndex?: string;
  }

  const { value, onchange, placement = "bottom-start", styleZIndex }: Props = $props();

  const latency = (host: string) => node.network.peers.find(p => p.label === host)?.latencyMs;


  function pick(seed: string) {
    onchange(seed);
    closeFocused();
  }
</script>

<style>
  .trigger {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2rem;
    padding: 0 0.5rem 0 0.625rem;
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-medium);
    color: var(--color-text-primary);
    white-space: nowrap;
  }
  .trigger:hover {
    border-color: var(--color-border-strong);
  }
  .trigger:focus-visible {
    border-color: var(--color-border-brand);
  }
  .muted-icon {
    display: inline-flex;
    color: var(--color-text-tertiary);
  }
  .menu {
    width: 22rem;
    padding: 0.25rem;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
  }
  .option {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: grid;
    grid-template-columns: 1rem 1.25rem minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.25rem 0.5rem;
    width: 100%;
    padding: 0.5rem;
    border-radius: var(--border-radius-sm);
  }
  .option:hover,
  .option:focus-visible {
    background: var(--color-surface-subtle);
  }
  .check {
    display: inline-flex;
    padding-top: 0.125rem;
  }
  .host {
    font: var(--txt-body-m-medium);
    color: var(--color-text-primary);
  }
  .meta {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    white-space: nowrap;
    padding-top: 0.125rem;
  }
  /* Only the digits are fixed-width; the font widens spaces too otherwise. */
  .digits {
    font-variant-numeric: tabular-nums;
  }
  .seed-avatar {
    display: inline-flex;
    flex-shrink: 0;
    overflow: hidden;
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-subtle);
  }
  .desc {
    grid-column: 3 / 5;
    font: var(--txt-body-s-regular);
    color: var(--color-text-secondary);
  }
  .divider {
    height: 1px;
    margin: 0.25rem 0;
    background: var(--color-border-subtle);
  }
</style>

<!-- Seeds get the same square, node-ID avatar as in the node's peer list. -->
{#snippet avatar(seed: string, size: string)}
  {#if seed === LOCAL_NODE}
    <Avatar person="self" {size} />
  {:else}
    <span class="seed-avatar" style:width={size} style:height={size}>
      <UserAvatar nodeId={nidFor(`peer:${seed}`)} styleWidth={size} />
    </span>
  {/if}
{/snippet}

<Popover {placement} {styleZIndex}>
  {#snippet toggle(onclick)}
    <button class="trigger" {onclick} aria-haspopup="listbox" title="Choose which node to browse">
      {@render avatar(value, "1rem")}
      {value === LOCAL_NODE ? "Your node" : seedLabel(value)}
      <span class="muted-icon"><Icon name="chevron-down" /></span>
    </button>
  {/snippet}
  {#snippet popover()}
    <div class="menu" role="listbox" aria-label="Seed nodes">
      {#each SEED_NODES as s (s.host)}
        <button class="option" role="option" aria-selected={value === s.host} onclick={() => pick(s.host)}>
          <span class="check">{#if value === s.host}<Icon name="checkmark" />{/if}</span>
          {@render avatar(s.host, "1.25rem")}
          <span class="host">{s.host}</span>
          <span class="meta">
            {plural(reposOn(s.host).length, "repo")}{#if latency(s.host) !== undefined}&nbsp;·&nbsp;<span
                class="digits">{latency(s.host)}</span>&nbsp;ms{/if}
          </span>
          <span class="desc">{s.description}</span>
        </button>
      {/each}
      <div class="divider"></div>
      <button class="option" role="option" aria-selected={value === LOCAL_NODE} onclick={() => pick(LOCAL_NODE)}>
        <span class="check">{#if value === LOCAL_NODE}<Icon name="checkmark" />{/if}</span>
        {@render avatar(LOCAL_NODE, "1.25rem")}
        <span class="host">Your node</span>
        <span class="meta">{plural(reposOn(LOCAL_NODE).length, "repo")}</span>
        <span class="desc">Only what you seed, straight from this tab.</span>
      </button>
    </div>
  {/snippet}
</Popover>
