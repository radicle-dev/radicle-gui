<script lang="ts">
  import type { EnrollmentPreview } from "@bindings/actor/EnrollmentPreview";

  import { invoke } from "@app/lib/invoke";
  import { publicKeyFromDid } from "@app/lib/utils";

  import Checkbox from "@app/components/Checkbox.svelte";
  import CopyableId from "@app/components/CopyableId.svelte";
  import Icon from "@app/components/Icon.svelte";
  import TextInput from "@app/components/TextInput.svelte";
  import ConfirmModal from "@app/modals/ConfirmModal.svelte";

  import { describeActorError } from "./actor";
  import KeyChunks from "./KeyChunks.svelte";

  interface Props {
    rid: string;
    majority: number;
    confirm: (code: string, controller: boolean) => Promise<void>;
  }

  const { rid, majority, confirm }: Props = $props();

  // The joining key makes the code, so it consents before anything changes;
  // this key only checks and signs it.
  let code = $state("");
  // Tooling defaults to enrolling a key as both, with an opt-out.
  let controller = $state(true);

  const ENROLL_PREFIX = "rad-enroll:";
  const looksLikeCode = $derived(code.trim().startsWith(ENROLL_PREFIX));

  // The code is checked as it is pasted, and the key it binds shown, so the
  // user can tell it is the machine they are adding before anything is
  // signed.
  type Check =
    | { status: "none" }
    | { status: "checking" }
    | { status: "ok"; preview: EnrollmentPreview }
    | { status: "failed"; message: string };
  let check = $state<Check>({ status: "none" });

  // A key that already controls the actor keeps that role whatever the box
  // says, so the box says so.
  const controls = $derived(check.status === "ok" && check.preview.controller);

  $effect(() => {
    if (controls) controller = true;
  });

  // A check scans every repository, so it waits for the typing to stop.
  const CHECK_DELAY_MS = 300;
  $effect(() => {
    const pasted = code.trim();
    check = { status: "none" };
    if (!looksLikeCode) return;

    let current = true;

    const timer = setTimeout(() => {
      check = { status: "checking" };
      invoke<EnrollmentPreview>("decode_enrollment", { code: pasted })
        .then(preview => {
          if (current) check = { status: "ok", preview };
        })
        .catch((error: unknown) => {
          if (current) check = { status: "failed", message: describe(error) };
        });
    }, CHECK_DELAY_MS);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  });

  function describe(error: unknown): string {
    return describeActorError(error, "Could not add the key.", {
      "ActorError.NotController":
        "This device's key cannot add keys. Approve from a key that can.",
    });
  }
</script>

<style>
  .step {
    display: flex;
    gap: 0.75rem;
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
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    flex: 1;
  }
  .lead,
  .step-text {
    color: var(--color-text-secondary);
  }
  .check-label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .hint {
    color: var(--color-text-tertiary);
  }
  .error {
    color: var(--color-feedback-error-text);
  }
  .verified {
    display: flex;
    gap: 0.5rem;
    padding: 0.875rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-subtle);
  }
  .verified-rows {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }
  .verified-row {
    color: var(--color-text-secondary);
  }
  .verified .ok {
    display: flex;
    flex-shrink: 0;
    padding-top: 0.125rem;
    color: var(--color-feedback-success-text);
  }
</style>

<ConfirmModal
  title="Add a key"
  width="34rem"
  icon="key"
  variant="secondary"
  label={majority > 1 ? "Sign and propose" : "Add key"}
  busyLabel="Signing…"
  disabled={check.status !== "ok"}
  confirm={() => confirm(code.trim(), controller)}
  describeError={describe}>
  {#snippet body()}
    <span class="lead txt-body-m-regular">
      Add another device's key so that your work on both devices appears under
      the same profile. Start on that device, then approve it here.
    </span>

    <div class="step">
      <span class="step-number">1</span>
      <div class="step-body">
        <span class="step-text txt-body-m-regular">
          On the device you are adding, open Profile, choose Join existing
          profile, and enter this Profile ID:
        </span>

        <CopyableId id={rid} styleFont="var(--txt-code-regular)">
          {rid}
        </CopyableId>
      </div>
    </div>

    <div class="step">
      <span class="step-number">2</span>
      <div class="step-body">
        <span class="step-text txt-body-m-regular">
          Create a code there, then paste it here.
        </span>
        <TextInput bind:value={code} placeholder="{ENROLL_PREFIX}…" autofocus />

        {#if code.trim() && !looksLikeCode}
          <span class="hint txt-body-s-regular">
            A code starts with {ENROLL_PREFIX}
          </span>
        {:else if check.status === "checking"}
          <span class="hint txt-body-s-regular">Checking the code…</span>
        {:else if check.status === "failed"}
          <span class="error txt-body-s-regular">{check.message}</span>
        {:else if check.status === "ok"}
          <div class="verified">
            <span class="ok"><Icon name="checkmark" /></span>

            <div class="verified-rows txt-body-m-regular">
              <div class="verified-row">
                Valid code. It adds the key below. Make sure the device you are
                adding shows the same key.
              </div>

              <!-- Whole, since a look-alike only has to match what is shown. -->
              <KeyChunks
                publicKey={publicKeyFromDid(check.preview.did)}
                name={check.preview.alias} />

              {#if check.preview.controller}
                <div class="verified-row">
                  Already a controller, as a recovery key. Adding it makes it a
                  full key.
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>

    <Checkbox bind:checked={controller} disabled={controls}>
      <span class="check-label">
        <span class="txt-body-m-regular">Also make it a controller</span>
        <span class="hint txt-body-s-regular">
          Recommended. Controllers are the keys that can add and remove other
          keys. Keep at least three, so losing one is not permanent. Turn this
          off for a device you do not fully trust. Its work still appears under
          your profile, but it cannot change which keys are yours or edit the
          profile.
        </span>
      </span>
    </Checkbox>
  {/snippet}
</ConfirmModal>
