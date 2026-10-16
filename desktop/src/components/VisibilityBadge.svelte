<script lang="ts">
  import type { Visibility } from "@bindings/repo/Visibility";

  import capitalize from "lodash/capitalize.js";

  import { pluralize } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    type: Visibility["type"];
    /// Whether the local node seeds the repository. When it does not, the
    /// repository is in storage but off the network, which `rad ls --all`
    /// reports as "local" in place of its visibility.
    seeded?: boolean;
    /// How many nodes on the network are known to seed the repository.
    seeds?: number;
    onclick?: () => void;
  }

  const {
    type,
    seeded = true,
    seeds = undefined,
    onclick = undefined,
  }: Props = $props();

  const tooltips: Record<Visibility["type"], string> = {
    public:
      "Anyone on the network can fetch and replicate this repository, and your node announces it to peers.",
    private:
      "Only the delegates and explicitly allowed peers can fetch this repository. It stays invisible to the rest of the network, and connections carrying it are encrypted.",
  };

  const tooltip = $derived.by(() => {
    if (!seeded) {
      return `This repository is in local storage but your node is not seeding it, so it is neither replicated nor announced to the network. Its visibility is set to ${type}.`;
    }
    if (type === "public" && seeds !== undefined) {
      return `${tooltips.public} ${seeds} ${pluralize("node", seeds)} on the network ${seeds === 1 ? "is" : "are"} known to seed it.`;
    }
    return tooltips[type];
  });

  const target = $derived(type === "public" ? "private" : "public");
  let previewing = $state(false);

  const title = $derived(
    onclick
      ? `${tooltip} Click to make it ${type === "public" ? "private" : "public"}.`
      : tooltip,
  );
</script>

<style>
  .badge {
    gap: 0.375rem;
    padding-right: 0.625rem;
    font: var(--txt-body-s-regular);
  }

  .public {
    background-color: var(--color-feedback-success-bg);
    color: var(--color-feedback-success-text);
  }
  .private {
    background-color: var(--color-feedback-warning-bg);
    color: var(--color-feedback-warning-text);
  }
  /* A repository that is only on this machine is not a state to celebrate or
     warn about, so it stays neutral. */
  .local {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  button.badge {
    border: 0;
    cursor: pointer;
  }
  .layers {
    display: grid;
  }
  /* Both labels share one cell, so the chip keeps the width of the wider one
     and does not resize on hover. */
  .layer {
    grid-area: 1 / 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
  }
  .layer.hidden {
    visibility: hidden;
  }
  /* The shared counter chip is grey and full height, which reads as a separate
     element bolted on. Inheriting the badge's colour and dropping the vertical
     padding keeps it part of the badge. */
  .count {
    color: inherit;
    padding: 0 0.25rem;
    min-width: 1rem;
  }
</style>

{#snippet content()}
  {#if !seeded}
    <Icon name="device" />
    Local
  {:else}
    <Icon name={type === "public" ? "globe" : "lock"} />
    {capitalize(type)}
    {#if type === "public" && seeds !== undefined}
      <span class="global-counter-badge count">{seeds}</span>
    {/if}
  {/if}
{/snippet}

{#if onclick}
  <button
    type="button"
    class="global-chip badge"
    class:public={previewing
      ? target === "public"
      : seeded && type === "public"}
    class:private={previewing
      ? target === "private"
      : seeded && type === "private"}
    class:local={!previewing && !seeded}
    {title}
    onclick={() => {
      previewing = false;
      onclick();
    }}
    onmouseenter={() => (previewing = true)}
    onmouseleave={() => (previewing = false)}>
    <span class="layers">
      <span class="layer" class:hidden={previewing}>
        {@render content()}
      </span>
      <span class="layer" class:hidden={!previewing}>
        <Icon name={target === "public" ? "globe" : "lock"} />
        {capitalize(target)}
      </span>
    </span>
  </button>
{:else}
  <span
    class="global-chip badge"
    class:public={seeded && type === "public"}
    class:private={seeded && type === "private"}
    class:local={!seeded}
    {title}>
    {@render content()}
  </span>
{/if}
