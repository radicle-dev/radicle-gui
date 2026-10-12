<script lang="ts">
  import type { ErrorWrapper } from "@bindings/error/ErrorWrapper";

  import debounce from "lodash/debounce";

  import { aliasErrors } from "@app/lib/inputValidation";
  import { invoke } from "@app/lib/invoke";
  import * as router from "@app/lib/router";
  import { createEventEmittersOnce } from "@app/lib/startup.svelte";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import TextInput from "@app/components/TextInput.svelte";
  import Layout from "@app/views/auth/Layout.svelte";

  let passphrase = $state("");
  let notMatchingPassphrases = $state<boolean>();
  let passphraseRepeat = $state("");
  let alias = $state("");
  const errors = $state<{ alias: ErrorWrapper[]; passphrase: ErrorWrapper[] }>({
    alias: [],
    passphrase: [],
  });

  const validatePassphraseRepeat = debounce(() => {
    if (passphrase !== passphraseRepeat && passphraseRepeat.length !== 0) {
      notMatchingPassphrases = true;
    }
  }, 400);

  function validateInput(field: "alias" | "passphrase") {
    if (field === "alias") {
      errors.alias = aliasErrors(alias).map(code => ({ code }));
    }
    if (field === "passphrase" && passphrase.length === 0) {
      errors.passphrase.push({ code: "PassphraseError.InvalidPassphrase" });
    }
  }

  const validAlias = $derived(aliasErrors(alias).length === 0);
  const validPassphrase = $derived(
    passphrase.length > 0 && passphrase === passphraseRepeat,
  );

  async function handleKeydown() {
    if (passphrase !== passphraseRepeat) {
      notMatchingPassphrases = true;

      return;
    }
    try {
      await invoke("init", { passphrase, alias });
      await invoke("startup");
      await invoke("authenticate", { passphrase });
      // Clearing the passphrases from memory.
      passphrase = "";
      passphraseRepeat = "";

      if (window.__TAURI_INTERNALS__) {
        await createEventEmittersOnce();
      }

      await router.push({ resource: "guide" });
    } catch (err) {
      const e = err as ErrorWrapper;
      if (e.code.startsWith("AliasError")) {
        errors.alias = [e];
      } else if (e.code.startsWith("PassphraseError")) {
        errors.passphrase = [e];
      }
      console.error(err);
    }

    return;
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
  .hint {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0 0 0.125rem;
  }
</style>

<Layout>
  <div class="header">
    <div class="txt-heading-l">Create identity</div>
    <div class="txt-body-m-regular" style:color="var(--color-text-secondary)">
      Set up your Radicle identity to get started.
    </div>
  </div>

  <div class="form">
    <div class="field">
      <div class="label">Alias</div>
      <TextInput
        autofocus
        onSubmit={handleKeydown}
        oninput={() => {
          errors.alias = [];
          if (alias.length > 0) {
            validateInput("alias");
          }
        }}
        placeholder="Enter desired alias"
        type="text"
        bind:value={alias} />
      {#if errors.alias.some(e => e.code.startsWith("AliasError"))}
        {#each errors.alias as error}
          <div
            style:color="var(--color-feedback-error-text)"
            class="hint txt-body-s-regular">
            <Icon name="warning" />
            {#if error.code === "AliasError.EmptyAlias"}
              <span>Alias cannot be empty.</span>
            {:else if error.code === "AliasError.TooLongAlias"}
              <span>Alias is too long, max 32 characters.</span>
            {:else if error.code === "AliasError.InvalidAlias"}
              <span>Alias cannot contain whitespace.</span>
            {/if}
          </div>
        {/each}
      {:else}
        <div class="hint txt-body-s-regular txt-missing">
          <Icon name="guide" /> Max 32 characters, no whitespace.
        </div>
      {/if}
    </div>

    <div class="field">
      <div class="label">Passphrase</div>
      <TextInput
        onSubmit={handleKeydown}
        oninput={() => {
          errors.passphrase = [];
          notMatchingPassphrases = false;
          if (passphrase.length > 0) {
            validateInput("passphrase");
          }
        }}
        placeholder="Enter passphrase to protect your keys"
        type="password"
        bind:value={passphrase} />
      {#if errors.passphrase.some(e => e.code.startsWith("PassphraseError"))}
        {#each errors.passphrase as error}
          <div
            style:color="var(--color-feedback-error-text)"
            class="hint txt-body-s-regular">
            <Icon name="warning" />
            {#if error.code === "PassphraseError.InvalidPassphrase"}
              <span>Passphrase cannot be empty.</span>
            {:else}
              <span>{error.message}</span>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <div class="field">
      <TextInput
        onSubmit={handleKeydown}
        oninput={() => {
          errors.passphrase = [];
          notMatchingPassphrases = false;
          validatePassphraseRepeat();
        }}
        placeholder="Repeat passphrase"
        type="password"
        bind:value={passphraseRepeat} />
      {#if notMatchingPassphrases}
        <div
          style:color="var(--color-feedback-error-text)"
          class="hint txt-body-s-regular">
          <Icon name="warning" /> Passphrases don't match.
        </div>
      {/if}
    </div>

    <Button
      disabled={!(validAlias && validPassphrase)}
      variant="secondary"
      onclick={handleKeydown}
      styleWidth="100%">
      <Icon name="seed" />Create new identity
    </Button>
  </div>
</Layout>
