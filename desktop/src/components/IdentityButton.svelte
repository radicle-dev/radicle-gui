<script lang="ts">
  import type { Config } from "@bindings/config/Config";

  import { routeToPath } from "@app/lib/router";
  import { didFromPublicKey } from "@app/lib/utils";

  import UserAvatar from "@app/components/UserAvatar.svelte";

  interface Props {
    config: Config;
    active?: boolean;
  }

  const { config, active = false }: Props = $props();
</script>

<style>
  .identity {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    text-decoration: none;
    width: 100%;
    min-width: 0;
  }
  .identity:hover,
  .identity.active {
    background-color: var(--color-surface-subtle);
  }
</style>

<a
  class="identity"
  class:active
  title="Your profile"
  href={routeToPath({
    resource: "user",
    did: didFromPublicKey(config.publicKey),
  })}>
  <UserAvatar nodeId={config.publicKey} styleWidth="1rem" />
  <span class="label txt-overflow">{config.alias}</span>
</a>
