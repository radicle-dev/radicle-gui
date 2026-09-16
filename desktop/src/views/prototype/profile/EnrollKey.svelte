<script lang="ts">
  import { onDestroy, untrack } from "svelte";

  import { hide } from "@app/lib/modal";
  import { truncateId } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Checkbox from "@app/components/Checkbox.svelte";
  import Command from "@app/components/Command.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Spinner from "@app/components/Spinner.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  import {
    ACTOR_RID,
    clearPrototypeAction,
    enrollKey,
    ENROLLMENT_CODE,
    identityMajority,
    mintKeyId,
    setPrototypeAction,
    thisKeyAlias,
  } from "./store.svelte";

  interface Props {
    onproposed?: () => void;
  }

  const { onproposed = undefined }: Props = $props();

  // The consent statement travels one way: the joining key produces it, a
  // controller approves it. Either it is carried by hand, or an off-protocol
  // service delivers it here as a join request.
  type Arrival = "request" | "code";
  type Step = "arrival" | "collect" | "review" | "sign" | "done";

  let arrival = $state<Arrival>("request");
  let step = $state<Step>("arrival");
  let pasted = $state("");
  let alias = $state("laptop");
  let makeController = $state(true);
  let proposed = $state(false);

  // Minted per flow, so enrolling a second key does not collide with the
  // first.
  const joiningKey = mintKeyId();

  // A join request that a notification service has already delivered.
  let requestReceived = $state(false);

  const codeValid = $derived(pasted.trim() === ENROLLMENT_CODE);
  const ready = $derived(arrival === "request" ? requestReceived : codeValid);

  // Whatever would move the flow along next lives in the prototype panel, so
  // the modal itself only shows what a real one would.
  $effect(() => {
    const action =
      step === "arrival" && arrival === "request" && !requestReceived
        ? {
            label: "Deliver the join request",
            run: () => (requestReceived = true),
          }
        : step === "collect" && arrival === "code" && !codeValid
          ? { label: "Paste the code", run: () => (pasted = ENROLLMENT_CODE) }
          : undefined;
    // Untracked: the registry is state this effect writes, and reading it here
    // would make the effect depend on its own output.
    untrack(() => {
      if (action) setPrototypeAction("enroll", action.label, action.run);
      else clearPrototypeAction("enroll");
    });
    return () => untrack(() => clearPrototypeAction("enroll"));
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  function sign() {
    step = "sign";
    const name = alias.trim() || "laptop";
    timer = setTimeout(() => {
      const approval = enrollKey({
        id: joiningKey,
        alias: name,
        // Tooling defaults to enrolling a key as both, with an opt-out.
        controller: makeController,
        bound: true,
        addedAt: Date.now(),
        lastSeen: Date.now(),
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
  const outstanding = $derived(Math.max(0, majority - 1));
</script>

<style>
  .modal {
    width: 40rem;
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
    gap: 0.75rem;
    padding: 0 1.25rem;
    height: 3.25rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .title {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
  }
  .header-end {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
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
  .step {
    display: flex;
    gap: 0.75rem;
  }
  .step-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
    border-radius: var(--border-radius-sm);
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
  }
  .step-text {
    color: var(--color-text-secondary);
  }
  .request {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
  }
  .request.arrived {
    border-color: var(--color-border-brand);
    background-color: var(--color-surface-brand-subtle);
  }
  .request-icon {
    display: flex;
    color: var(--color-text-tertiary);
  }
  .request.arrived .request-icon {
    color: var(--color-text-brand);
  }
  .request-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .request-title {
    color: var(--color-text-primary);
  }
  .request-note {
    color: var(--color-text-secondary);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .field-label {
    color: var(--color-text-primary);
  }
  .field-hint {
    color: var(--color-text-secondary);
  }
  .field-description {
    color: var(--color-text-secondary);
  }
  .verified {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.875rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-subtle);
  }
  .verified-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text-secondary);
  }
  .verified-row .ok {
    display: flex;
    color: var(--color-feedback-success-text);
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
    color: var(--color-text-primary);
  }
  .check-label {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
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
    max-width: 26rem;
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
    <span class="title">Add a key</span>
    <div class="header-end">
      {#if step === "arrival" || step === "collect"}
        <Button
          variant="ghost"
          styleHeight="1.75rem"
          flatRight
          active={arrival === "request"}
          onclick={() => {
            arrival = "request";
            step = "arrival";
          }}>
          Join request
        </Button>
        <Button
          variant="ghost"
          styleHeight="1.75rem"
          flatLeft
          active={arrival === "code"}
          onclick={() => {
            arrival = "code";
            step = "collect";
          }}>
          Enrollment code
        </Button>
      {/if}
      <Button variant="naked" onclick={hide}>
        <span style:color="var(--color-text-tertiary)">
          <Icon name="close" />
        </span>
      </Button>
    </div>
  </div>

  {#if step === "arrival" || step === "collect"}
    <div class="body">
      <span class="lead txt-body-m-regular">
        Adding a key lets another machine work as you. Start there, then approve
        it here.
      </span>

      <div class="step">
        <span class="step-number">1</span>
        <div class="step-body">
          <span class="step-text txt-body-m-regular">
            On the machine you are adding, run:
          </span>
          <Command command="rad actor join {ACTOR_RID}" styleWidth="100%" />
        </div>
      </div>

      <div class="step">
        <span class="step-number">2</span>
        <div class="step-body">
          {#if arrival === "request"}
            <span class="step-text txt-body-m-regular">
              It will show up here as a request to approve.
            </span>
            <div class="request" class:arrived={requestReceived}>
              <span class="request-icon">
                {#if requestReceived}
                  <Icon name="bell" />
                {:else}
                  <Spinner />
                {/if}
              </span>
              <div class="request-text">
                {#if requestReceived}
                  <span class="request-title txt-body-m-medium">
                    {truncateId(joiningKey)} wants to join
                  </span>
                  <span class="request-note txt-body-m-regular">
                    Ready to approve.
                  </span>
                {:else}
                  <span class="request-title txt-body-m-medium">
                    Waiting for the other machine
                  </span>
                  <span class="request-note txt-body-m-regular">
                    Nothing happens until you approve it.
                  </span>
                {/if}
              </div>
            </div>
          {:else}
            <span class="step-text txt-body-m-regular">
              It prints a code. Paste it here.
            </span>
            <TextInput bind:value={pasted} placeholder="rad-enroll:…" />
            {#if pasted.trim() && !codeValid}
              <span class="field-hint txt-body-s-regular">
                That code is not for this profile.
              </span>
            {/if}
          {/if}
        </div>
      </div>
    </div>
    <div class="footer">
      <Button
        variant="secondary"
        disabled={!ready}
        onclick={() => (step = "review")}>
        Continue
      </Button>
    </div>
  {:else if step === "review"}
    <div class="body">
      <div class="verified">
        <div class="verified-row txt-body-m-regular">
          <span class="ok"><Icon name="checkmark" /></span>
          Checked. This is the key you started on the other machine.
        </div>
        <div class="verified-row txt-body-m-regular">
          <span class="mono">{truncateId(joiningKey)}</span>
        </div>
      </div>

      <div class="field">
        <span class="field-label txt-body-m-medium">Alias for the new key</span>
        <span class="field-description txt-body-m-regular">
          So you can tell your machines apart. Only you see this.
        </span>
        <TextInput bind:value={alias} placeholder="laptop" />
      </div>

      <Checkbox bind:checked={makeController}>
        <span class="check-label">
          <span class="field-label txt-body-m-regular">
            Also make it a controller
          </span>
          <span class="field-hint txt-body-s-regular">
            Recommended. Controllers are the keys that can add and remove other
            keys. Keep at least three, so losing one is not permanent. Turn this
            off for a machine you do not fully trust: it can still work as you,
            but it cannot change which keys are yours.
          </span>
        </span>
      </Checkbox>
    </div>
    <div class="footer">
      <Button
        variant="outline"
        bordered
        onclick={() => (step = arrival === "request" ? "arrival" : "collect")}>
        Back
      </Button>
      <Button variant="secondary" onclick={sign}>
        {majority > 1 ? "Sign and propose" : "Enroll key"}
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
        <span class="result-title">Enrollment proposed</span>
        <span class="result-body txt-body-m-regular">
          {alias.trim() || "laptop"} needs approval from {outstanding} of your other
          keys before it can work as you. Approve from those machines to finish.
        </span>
      {:else}
        <span class="result-title">{alias.trim() || "laptop"} enrolled</span>
        <span class="result-body txt-body-m-regular">
          It can work as you now, and will appear on your other machines once
          they sync.
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
