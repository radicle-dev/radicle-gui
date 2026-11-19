<script lang="ts">
  import ConfirmModal from "@app/modals/ConfirmModal.svelte";

  import { describeActorError } from "./actor";
  import Notice from "./Notice.svelte";

  interface Props {
    name: string;
    rid: string;
    // The profiles shown that this device is in besides the one retired, by
    // name; empty if none can be shown.
    staysIn: string;
    // The devices the profile has besides this one.
    others: number;
    confirm: () => Promise<void>;
  }

  const { name, rid, staysIn, others, confirm }: Props = $props();
</script>

<style>
  .profile {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--color-text-primary);
  }
  .rid {
    word-break: break-all;
  }
  .caution {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }
</style>

<ConfirmModal
  title="Retire profile"
  width="28rem"
  label="Retire"
  busyLabel="Retiring…"
  describeError={e =>
    describeActorError(e, "Could not retire the profile.", {
      "ActorError.NotController":
        "This device's key does not control this profile, so it cannot retire it.",
      "ActorError.PayloadNewer":
        "This profile holds fields this version of Desktop does not know, so it cannot retire it.",
    })}
  {confirm}>
  {#snippet body()}
    <div class="profile">
      <span class="txt-body-m-medium">{name}</span>
      <span class="rid">{rid}</span>
    </div>

    <span>
      This ends the profile.
      {#if staysIn}
        This device stays in {staysIn}.
      {/if}
    </span>

    <Notice icon="warning" tone="warning">
      <div class="caution">
        {#if others === 1}
          <span>
            This profile has 1 other device. It loses the profile too, without
            being asked.
          </span>
        {:else if others > 1}
          <span>
            This profile has {others} other devices. They lose the profile too, without
            being asked.
          </span>
        {/if}

        <span>
          Nothing is deleted. The profile stays on the network with everything
          saved in it.
        </span>

        <span>This cannot be undone.</span>
      </div>
    </Notice>
  {/snippet}
</ConfirmModal>
