<script lang="ts">
  import type { Author } from "@bindings/cob/Author";
  import type { ErrorWrapper } from "@bindings/error/ErrorWrapper";

  import { invoke } from "@app/lib/invoke";
  import * as router from "@app/lib/router";
  import {
    createEventEmittersOnce,
    setUnlistenNodeEvents,
  } from "@app/lib/startup.svelte";
  import { truncateDid } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Spinner from "@app/components/Spinner.svelte";
  import TextInput from "@app/components/TextInput.svelte";
  import Layout from "@app/views/auth/Layout.svelte";

  interface Props {
    profile: Author;
  }

  let error = $state<ErrorWrapper>();
  let passphrase = $state("");
  let authInProgress = $state(false);
  const { profile }: Props = $props();

  async function authenticate() {
    if (passphrase.length > 0) {
      authInProgress = true;
      error = undefined;
      try {
        await invoke("authenticate", { passphrase });
        setUnlistenNodeEvents(await createEventEmittersOnce());
        passphrase = " ".repeat(passphrase.length);
        await router.push({ resource: "inbox" });
      } catch (err) {
        error = err as ErrorWrapper;
      } finally {
        authInProgress = false;
      }
    }
  }
</script>

<style>
  .header {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    align-items: center;
    text-align: center;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .label {
    font: var(--txt-body-s-semibold);
    color: var(--color-text-secondary);
  }
  .profile-card {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
  }
  .profile-row {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.5rem 0.75rem;
  }
  .profile-row + .profile-row {
    border-top: 1px solid var(--color-border-subtle);
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0 0 0.125rem;
  }
</style>

<Layout>
  <div class="header">
    <div class="txt-heading-l">Unlock keys</div>
    <div class="txt-body-m-regular" style:color="var(--color-text-secondary)">
      Your passphrase is needed to unlock your keys.
    </div>
  </div>

  <div class="form">
    <div class="profile-card">
      <div class="profile-row">
        <div class="label">Alias</div>
        <div class="txt-body-m-regular">{profile.alias}</div>
      </div>
      <div class="profile-row">
        <div class="label">DID</div>
        <div class="txt-body-m-regular">{truncateDid(profile.did)}</div>
      </div>
    </div>

    <div class="field">
      <div class="label">Passphrase</div>
      <TextInput
        autofocus
        onSubmit={authenticate}
        oninput={() => {
          error = undefined;
        }}
        placeholder="Enter passphrase to unlock your keys"
        type="password"
        bind:value={passphrase} />
      {#if error?.code === "PassphraseError.InvalidPassphrase"}
        <div
          style:color="var(--color-feedback-error-text)"
          class="hint txt-body-s-regular">
          <Icon name="warning" />
          <span>Not able to decrypt keys with provided passphrase.</span>
        </div>
      {/if}
    </div>

    <Button
      disabled={authInProgress || passphrase.length === 0}
      variant="secondary"
      onclick={authenticate}
      styleWidth="100%">
      {#if authInProgress}
        <Spinner /> Unlocking…
      {:else}
        <Icon name="lock" /> Unlock
      {/if}
    </Button>
  </div>
</Layout>
