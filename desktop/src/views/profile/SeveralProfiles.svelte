<script lang="ts">
  import type { ActorInfo } from "@bindings/actor/ActorInfo";

  import { invoke } from "@app/lib/invoke";
  import { show } from "@app/lib/modal";
  import type { ProfileTab } from "@app/lib/router/definitions";

  import Button from "@app/components/Button.svelte";
  import CopyableId from "@app/components/CopyableId.svelte";

  import {
    change,
    controllersOf,
    describeActorError,
    isController,
    mayChangeKeys,
    profileName,
    votedRemoval,
    votesText,
  } from "./actor";
  import Notice from "./Notice.svelte";
  import RetireProfile from "./RetireProfile.svelte";

  interface Props {
    localDid: string;
    tab: ProfileTab;
    // What the backend said when it found the key in several profiles.
    message: string;
  }

  const { localDid, tab, message }: Props = $props();

  let actors = $state<ActorInfo[]>();
  let loadError = $state<string>();
  let acting = $state(false);
  let confirming = $state<string>();
  let actionError = $state<{ rid: string; message: string }>();

  // A load of the page builds this anew, so another device's vote shows
  // then, as on every profile page.
  async function load() {
    try {
      actors = await invoke<ActorInfo[]>("actors_of_key");
      loadError = undefined;
    } catch (e) {
      loadError = describeActorError(e, message);
    }
  }
  void load();

  const nameOf = (actor: ActorInfo) =>
    actor.profile?.displayName || "the profile with no name";

  // The open change by which this device leaves `actor`, once it has voted.
  // The backend also counts a change from another tool that unbinds the key
  // without removing it; that one shows only as its refusal of a leave.
  const leaveOf = (actor: ActorInfo) => votedRemoval(actor, localDid, localDid);

  // One leave at a time: two that both went through would leave this device
  // in no profile.
  const leaving = $derived(actors?.find(actor => leaveOf(actor)));

  const several = $derived(actors !== undefined && actors.length > 2);

  function staysIn(left: ActorInfo): string {
    return (actors ?? [])
      .filter(actor => actor.rid !== left.rid)
      .map(nameOf)
      .join(" and ");
  }

  // Retiring is permanent and applies at once, so it is confirmed in a
  // dialog, which shows a failure itself.
  function openRetire(actor: ActorInfo) {
    show({
      component: RetireProfile,
      props: {
        name: profileName(actor),
        rid: actor.rid,
        staysIn: staysIn(actor),
        others: actor.keys.length - 1,
        confirm: async () => {
          try {
            await change(
              { command: "retire_actor", args: { rid: actor.rid } },
              tab,
            );
          } finally {
            // Not waited for: the page has reloaded by now, and this only
            // refreshes the list where the device is still in several.
            void load();
          }
        },
      },
    });
  }

  async function act(
    command: "leave_actor" | "cancel_leave",
    actor: ActorInfo,
    fallback: string,
  ) {
    confirming = undefined;
    actionError = undefined;
    acting = true;

    try {
      await change({ command, args: { rid: actor.rid } }, tab);
    } catch (e) {
      actionError = {
        rid: actor.rid,
        message: describeActorError(e, fallback),
      };
    } finally {
      await load();
      acting = false;
    }
  }
</script>

<style>
  .profiles {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    overflow: hidden;
  }
  .profile {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background-color: var(--color-surface-canvas);
  }
  .profile + .profile {
    border-top: 1px solid var(--color-border-subtle);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--color-text-primary);
  }
  .text {
    color: var(--color-text-secondary);
  }
  .confirm {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
    color: var(--color-text-secondary);
  }
  .did {
    color: var(--color-text-primary);
    word-break: break-all;
  }
  .error {
    color: var(--color-feedback-error-text);
  }
</style>

<Notice
  icon="warning"
  tone="error"
  title={several
    ? "This device is in several profiles"
    : "This device is in two profiles"}>
  <span class="txt-body-m-regular">
    {#if several}
      A device belongs to one profile. Until this one is in one only, its work
      is credited to none of them and it cannot change any.
    {:else}
      A device belongs to one profile. Until this one leaves the other, its work
      is credited to neither and it cannot change either.
    {/if}
  </span>
</Notice>

{#if loadError}
  <span class="error txt-body-m-regular">{loadError}</span>
{:else if actors}
  <div class="profiles">
    {#each actors as actor (actor.rid)}
      {@const controllers = controllersOf(actor)}
      {@const open = leaveOf(actor)}

      <div class="profile txt-body-m-regular">
        <div class="head">
          <div class="name">
            <span class="txt-body-m-medium">
              {profileName(actor)}
            </span>

            <CopyableId id={actor.rid} styleFont="var(--txt-body-m-regular)">
              {actor.rid}
            </CopyableId>
          </div>

          {#if open?.author === localDid}
            <Button
              variant="outline"
              bordered
              disabled={acting}
              onclick={() =>
                act("cancel_leave", actor, "Could not cancel the leave.")}>
              Cancel leave
            </Button>
          {:else if !leaving && mayChangeKeys(actor, localDid) && controllers.length > 1 && confirming !== actor.rid}
            <Button
              variant="outline"
              bordered
              disabled={acting}
              onclick={() => (confirming = actor.rid)}>
              Leave
            </Button>
          {:else if !leaving && mayChangeKeys(actor, localDid) && controllers.length === 1}
            <Button
              variant="outline"
              bordered
              disabled={acting}
              onclick={() => openRetire(actor)}>
              Retire
            </Button>
          {/if}
        </div>

        {#if open?.author === localDid}
          <span class="text">
            You asked to leave. Open Keys on a device that controls this profile
            and approve the change. {votesText(actor, open)}.
          </span>
        {:else if open}
          <!-- Only the key that proposed a change withdraws it. -->
          <span class="text">
            Another device proposed removing this one, and you approved.
            {votesText(actor, open)}. Only that device can withdraw it.
          </span>
        {:else if leaving}
          <span class="text">
            You are already leaving {nameOf(leaving)}. Cancel that leave first,
            or wait until it is approved or rejected.
          </span>
        {:else if !isController(actor, localDid)}
          <span class="text">
            Only a controller can remove this device. Open Keys on one of these
            and revoke this device's key:
          </span>

          {#each controllers as key (key.did)}
            <span class="txt-body-s-regular">
              {#if key.alias}
                <span class="txt-body-s-medium">{key.alias}</span>
              {/if}
              <span class="did">{key.did}</span>
            </span>
          {/each}
        {:else if actor.payloadNewer}
          <span class="text">
            Written by a newer Desktop or another app, so this device cannot
            leave it from here.
          </span>
        {:else if controllers.length === 1}
          <span class="text">
            This device is the only controller here, so it cannot leave. This
            profile can only be retired.
          </span>
        {:else if confirming === actor.rid}
          <div class="confirm">
            <span>
              Leave {nameOf(actor)}? This device stays in {staysIn(actor)} and cannot
              be added to {nameOf(actor)} again while {staysIn(actor)} exists.
            </span>

            <Button
              variant="ghost"
              styleHeight="1.75rem"
              disabled={acting}
              onclick={() =>
                act("leave_actor", actor, "Could not leave the profile.")}>
              Yes
            </Button>

            <Button
              variant="outline"
              styleHeight="1.75rem"
              disabled={acting}
              onclick={() => (confirming = undefined)}>
              Cancel
            </Button>
          </div>
        {/if}

        {#if actionError?.rid === actor.rid}
          <span class="error">{actionError.message}</span>
        {/if}
      </div>
    {/each}
  </div>
{/if}
