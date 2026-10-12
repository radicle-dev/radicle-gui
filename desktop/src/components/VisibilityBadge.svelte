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
  }

  const { type, seeded = true, seeds = undefined }: Props = $props();

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
  /* The shared counter chip is grey and full height, which reads as a separate
     element bolted on. Inheriting the badge's colour and dropping the vertical
     padding keeps it part of the badge. */
  .count {
    color: inherit;
    padding: 0 0.25rem;
    min-width: 1rem;
  }
</style>

<span
  class="global-chip badge"
  class:public={seeded && type === "public"}
  class:private={seeded && type === "private"}
  class:local={!seeded}
  title={tooltip}>
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
</span>
