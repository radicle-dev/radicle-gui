<script lang="ts">
  import { onDestroy } from "svelte";

  import { hide } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import Checkbox from "@app/components/Checkbox.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Spinner from "@app/components/Spinner.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  import {
    enrollKey,
    identityMajority,
    mintKeyId,
    thisKeyAlias,
  } from "./store.svelte";

  interface Props {
    onproposed?: () => void;
  }

  const { onproposed = undefined }: Props = $props();

  // A recovery key is a controller that is never bound: it votes on identity
  // changes and never acts as the actor, so its compromise yields one vote
  // and nothing else.
  type Step = "explain" | "store" | "sign" | "done";

  let step = $state<Step>("explain");
  let alias = $state("recovery");
  let stored = $state(false);
  let proposed = $state(false);

  // Minted per flow, so a second recovery key does not collide with the first.
  const recoveryKey = mintKeyId();

  const phrase =
    "anchor drift lantern marble quiver saddle thistle vellum wander zenith cobalt ember";

  let timer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  function sign() {
    step = "sign";
    const name = alias.trim() || "recovery";
    timer = setTimeout(() => {
      const approval = enrollKey({
        id: recoveryKey,
        alias: name,
        controller: true,
        // Never bound: nothing it signs is attributed to the actor.
        bound: false,
        addedAt: Date.now(),
        lastSeen: undefined,
        thisKey: false,
      });
      proposed = approval !== undefined;
      step = "done";
    }, 1200);
  }

  function finish() {
    if (proposed) onproposed?.();
    hide();
  }

  const majority = $derived(identityMajority());
</script>

<style>
  .modal {
    width: 36rem;
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
    padding: 0 1.25rem;
    height: 3.25rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .title {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
  }
  .lead {
    color: var(--color-text-secondary);
  }
  .points {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .point {
    display: flex;
    gap: 0.5rem;
    color: var(--color-text-secondary);
  }
  .point-icon {
    display: flex;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
    padding-top: 0.125rem;
  }
  .phrase {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.375rem;
    padding: 0.875rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-subtle);
  }
  .word {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
    color: var(--color-text-primary);
  }
  .word span {
    color: var(--color-text-quaternary);
    margin-right: 0.375rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .field-label {
    color: var(--color-text-primary);
  }
  .warning {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.75rem;
    border: 1px solid var(--color-feedback-warning-border);
    border-radius: var(--border-radius-md);
    background-color: var(--color-feedback-warning-bg);
    color: var(--color-feedback-warning-text);
  }
  .warning-heading {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .result {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.625rem;
    padding: 2rem 1.5rem;
    text-align: center;
  }
  .result-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--border-radius-md);
  }
  .result-icon.success {
    background-color: var(--color-feedback-success-bg);
    color: var(--color-feedback-success-text);
  }
  .result-icon.pending {
    background-color: var(--color-feedback-warning-bg);
    color: var(--color-feedback-warning-text);
  }
  .result-title {
    font: var(--txt-body-l-medium);
    color: var(--color-text-primary);
  }
  .result-body {
    color: var(--color-text-secondary);
    max-width: 24rem;
  }
  .footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.875rem 1.25rem;
    border-top: 1px solid var(--color-border-subtle);
  }
</style>

<div class="modal">
  <div class="header">
    <span class="title">Add a recovery key</span>
    <Button variant="naked" onclick={hide}>
      <span style:color="var(--color-text-tertiary)">
        <Icon name="close" />
      </span>
    </Button>
  </div>

  {#if step === "explain"}
    <div class="body">
      <span class="lead txt-body-m-regular">
        A recovery key lives in your password manager or on paper, never on a
        machine. It is there to get you back in if you lose one.
      </span>
      <div class="points">
        <div class="point txt-body-m-regular">
          <span class="point-icon"><Icon name="checkmark" /></span>
          <span>
            It gets you to three keys, so losing a machine stops being
            permanent. The two you still have can remove the lost one and add a
            replacement.
          </span>
        </div>
        <div class="point txt-body-m-regular">
          <span class="point-icon"><Icon name="checkmark" /></span>
          <span>
            It never works as you, so it cannot post or sign anything in your
            name. Even if someone finds it, they cannot pretend to be you.
          </span>
        </div>
        <div class="point txt-body-m-regular">
          <span class="point-icon"><Icon name="checkmark" /></span>
          <span>
            A password manager is a good home for it. So is paper in a drawer.
          </span>
        </div>
      </div>
    </div>
    <div class="footer">
      <Button variant="secondary" onclick={() => (step = "store")}>
        Generate a key
      </Button>
    </div>
  {:else if step === "store"}
    <div class="body">
      <span class="lead txt-body-m-regular">
        Store this somewhere you will still have it after losing a machine. It
        is shown once.
      </span>
      <div class="phrase">
        {#each phrase.split(" ") as word, index (word)}
          <span class="word txt-body-m-regular">
            <span>{index + 1}</span>
            {word}
          </span>
        {/each}
      </div>

      <div class="warning">
        <div class="warning-heading txt-body-m-medium">
          <Icon name="warning" />
          Not recoverable
        </div>
        <span class="txt-body-m-regular">
          Nobody can reissue this for you. If you lose it, it is gone.
        </span>
      </div>

      <div class="field">
        <span class="field-label txt-body-m-medium">Name it</span>
        <TextInput bind:value={alias} placeholder="recovery" />
      </div>

      <Checkbox bind:checked={stored}>I have stored the phrase.</Checkbox>
    </div>
    <div class="footer">
      <Button variant="outline" bordered onclick={() => (step = "explain")}>
        Back
      </Button>
      <Button variant="secondary" disabled={!stored} onclick={sign}>
        {majority > 1 ? "Sign and propose" : "Add recovery key"}
      </Button>
    </div>
  {:else if step === "sign"}
    <div class="result">
      <Spinner />
      <span class="result-title">Signing with {thisKeyAlias()}…</span>
    </div>
  {:else}
    <div class="result">
      <span
        class="result-icon"
        class:success={!proposed}
        class:pending={proposed}>
        <Icon name={proposed ? "hourglass" : "checkmark"} />
      </span>
      {#if proposed}
        <span class="result-title">Recovery key proposed</span>
        <span class="result-body txt-body-m-regular">
          Your other keys need to approve this before it starts counting.
        </span>
      {:else}
        <span class="result-title">Recovery key added</span>
        <span class="result-body txt-body-m-regular">
          It can help you get back in, and will never work as you.
        </span>
      {/if}
    </div>
    <div class="footer">
      <Button variant="secondary" onclick={finish}>
        {proposed ? "View approval" : "Done"}
      </Button>
    </div>
  {/if}
</div>
