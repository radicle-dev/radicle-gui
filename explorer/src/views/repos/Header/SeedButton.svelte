<script lang="ts">
  import Button from "@app/components/Button.svelte";
  import Command from "@app/components/Command.svelte";
  import ExternalLink from "@app/components/ExternalLink.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";

  export let repoId: string;
  export let seedCount: number;
  export let disabled: boolean = false;
</script>

<style>
  .seed-label {
    display: block;
    font: var(--txt-body-m-regular);
    margin-bottom: 0.75rem;
  }
  .title-counter {
    display: flex;
    gap: 0.5rem;
  }
  .counter {
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-strong);
    color: var(--color-text-primary);
    padding: 0 0.25rem;
  }
  .not-seeding {
    background-color: var(--color-surface-mid);
    color: var(--color-text-secondary);
  }
  .disabled {
    background-color: var(--color-surface-mid);
    color: var(--color-text-disabled);
  }
</style>

<Popover popoverPositionTop="2.5rem" popoverPositionRight="0">
  <Button
    slot="toggle"
    {disabled}
    let:toggle
    on:click={() => {
      toggle();
    }}
    variant="gray">
    <Icon name="seed" />
    <span class="title-counter">
      <span class="global-hide-on-mobile-down">Seed</span>
      <span class="counter not-seeding" class:disabled>
        {seedCount}
      </span>
    </span>
  </Button>

  <div slot="popover" style:width="auto">
    <span class="seed-label">
      Use the <ExternalLink href="https://radicle.dev">
        Radicle CLI
      </ExternalLink> to start seeding this repository.
    </span>
    <Command command={`rad seed ${repoId}`} />
  </div>
</Popover>
