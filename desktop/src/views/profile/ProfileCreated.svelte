<script lang="ts">
  import type { ActorInfo } from "@bindings/actor/ActorInfo";

  import { hide } from "@app/lib/modal";
  import * as router from "@app/lib/router";

  import ActorAvatar from "@app/components/ActorAvatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Clipboard from "@app/components/Clipboard.svelte";
  import Icon from "@app/components/Icon.svelte";

  import { profileName } from "./actor";

  interface Props {
    actor: ActorInfo;
  }

  const { actor }: Props = $props();
  const rid = $derived(actor.rid);

  async function toKeys() {
    hide();
    await router.push({ resource: "profile", tab: "keys" });
  }
</script>

<style>
  .modal {
    width: 30rem;
    max-width: 92vw;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-lg);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    height: 3.25rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .title {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.5rem;
  }
  .profile {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .avatar {
    width: 2.5rem;
    height: 2.5rem;
    flex-shrink: 0;
    overflow: hidden;
    border-radius: var(--border-radius-md);
  }
  .name {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--color-text-primary);
  }
  .next {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .next-title {
    color: var(--color-text-primary);
  }
  .step {
    display: flex;
    gap: 0.75rem;
    color: var(--color-text-secondary);
  }
  .step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
    font: var(--txt-body-m-medium);
  }
  .step-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.125rem;
  }
  .id {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    font: var(--txt-code-regular);
    color: var(--color-text-primary);
    word-break: break-all;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0 1.5rem 1.5rem;
  }
</style>

<div class="modal">
  <div class="header">
    <span class="title">Profile created</span>
    <Button variant="naked" onclick={hide}>
      <span style:color="var(--color-text-tertiary)">
        <Icon name="close" />
      </span>
    </Button>
  </div>

  <div class="body">
    <div class="profile">
      <span class="avatar">
        <ActorAvatar {actor} styleWidth="100%" />
      </span>
      <span class="name txt-body-m-medium">{profileName(actor)}</span>
    </div>

    <div class="next">
      <span class="next-title txt-body-m-medium">Add your other devices</span>

      <div class="step txt-body-m-regular">
        <span class="step-number">1</span>
        <span class="step-body">
          On another device, open Profile and choose Join existing profile.
        </span>
      </div>

      <div class="step txt-body-m-regular">
        <span class="step-number">2</span>
        <div class="step-body">
          Paste this Profile ID.
          <div class="id">
            <span style:flex="1">{rid}</span>
            <Clipboard text={rid} />
          </div>
        </div>
      </div>

      <div class="step txt-body-m-regular">
        <span class="step-number">3</span>
        <span class="step-body">Approve the device here, under Keys.</span>
      </div>
    </div>
  </div>

  <div class="actions">
    <Button variant="outline" bordered onclick={hide}>Done</Button>
    <Button variant="secondary" onclick={() => void toKeys()}>
      Go to Keys
    </Button>
  </div>
</div>
