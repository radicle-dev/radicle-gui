<script lang="ts">
  import type { Profile, ProfileLink } from "./store.svelte";

  import { show } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Textarea from "@app/components/Textarea.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  import ImagePicker from "./ImagePicker.svelte";
  import ProfileHistory from "./ProfileHistory.svelte";
  import PronounsPicker from "./PronounsPicker.svelte";
  import {
    LIMITS,
    PROFILE_PATH,
    profileEditsApplyDirectly,
    prototype,
    README_PATH,
    saveProfile,
  } from "./store.svelte";
  import TimezonePicker from "./TimezonePicker.svelte";

  interface Props {
    draft: Profile;
    onproposed: () => void;
  }

  /* eslint-disable prefer-const */
  let { draft = $bindable(), onproposed }: Props = $props();
  /* eslint-enable prefer-const */

  const changed = $derived(
    JSON.stringify($state.snapshot(draft)) !==
      JSON.stringify($state.snapshot(prototype.profile)),
  );
  const dirty = $derived(changed || !prototype.hasProfile);

  let submitted = $state(false);

  // `version` and `displayName` are the schema's only required fields.
  const nameMissing = $derived(draft.displayName.trim().length === 0);
  const nameTooLong = $derived(draft.displayName.length > LIMITS.displayName);
  const nameValid = $derived(!nameMissing && !nameTooLong);
  // Shown only once a submit has been attempted.
  const nameError = $derived.by(() => {
    if (!submitted) return undefined;
    if (nameMissing) return "Enter a display name.";
    if (nameTooLong)
      return `Too long by ${draft.displayName.length - LIMITS.displayName} characters.`;
    return undefined;
  });
  const bioLeft = $derived(LIMITS.bio - draft.bio.length);
  const bioError = $derived(
    submitted && bioLeft < 0
      ? `Too long by ${Math.abs(bioLeft)} characters.`
      : undefined,
  );
  const canAddLink = $derived(draft.links.length < LIMITS.links);

  let nextLinkId = 100;

  function addLink() {
    if (!canAddLink) return;
    nextLinkId += 1;
    draft.links = [
      ...draft.links,
      { id: `l${nextLinkId}`, url: "", label: "" } satisfies ProfileLink,
    ];
  }

  function removeLink(id: string) {
    draft.links = draft.links.filter(l => l.id !== id);
  }

  async function save() {
    submitted = true;
    if (!nameValid || bioLeft < 0) return;
    if (saveProfile(structuredClone($state.snapshot(draft)))) onproposed();
    submitted = false;
  }

  function discard() {
    draft = structuredClone($state.snapshot(prototype.profile));
    submitted = false;
  }
</script>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .permanence {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .history-link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-text-secondary);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  .history-link:hover {
    color: var(--color-text-primary);
  }
  .permanence-icon {
    display: flex;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
    padding-top: 0.0625rem;
  }
  .ratify-note {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.75rem;
    border: 1px solid var(--color-feedback-warning-border);
    border-radius: var(--border-radius-md);
    background-color: var(--color-feedback-warning-bg);
    color: var(--color-feedback-warning-text);
  }
  .ratify-heading {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .picker {
    min-width: 0;
  }
  .field-label {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    color: var(--color-text-primary);
  }
  /* Drawn rather than marked up, so reformatting cannot put a space between
     the asterisk and the word it marks. */
  .required::after {
    content: "*";
    color: var(--color-text-quaternary);
  }
  .field-hint {
    color: var(--color-text-secondary);
  }
  .field-description {
    color: var(--color-text-secondary);
  }
  .field-aside {
    color: var(--color-text-quaternary);
  }
  .field-error {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-feedback-error-text);
  }
  .counter {
    margin-left: auto;
    color: var(--color-text-tertiary);
  }
  .counter.over {
    color: var(--color-feedback-error-text);
  }
  .row {
    display: flex;
    gap: 0.75rem;
  }
  .row > :global(*) {
    flex: 1;
    min-width: 0;
  }
  /* Sized to its dropdown rather than taking an equal third. */
  .row > .compact {
    flex: 0 0 auto;
    max-width: 14rem;
  }
  .links {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .link-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .link-url-field {
    flex: 1;
    min-width: 0;
  }
  .link-label-field {
    width: 9rem;
    flex-shrink: 0;
  }
  .footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 0.25rem;
  }
  .footer-note {
    margin-right: auto;
    color: var(--color-text-tertiary);
  }
</style>

<div class="form">
  {#if !profileEditsApplyDirectly()}
    <div class="ratify-note">
      <div class="ratify-heading txt-body-m-medium">
        <Icon name="lock" />
        Needs approval
      </div>
      <span class="txt-body-m-regular">
        Saving will not publish this straight away. It goes live once
        {prototype.threshold} of your keys have approved it.
      </span>
    </div>
  {/if}

  <ImagePicker
    label="Avatar"
    fallbackNodeId={prototype.thisKeyId}
    bind:value={draft.avatar} />

  <ImagePicker label="Banner" shape="wide" bind:value={draft.banner} />

  <div class="row">
    <div class="field">
      <span class="field-label txt-body-m-medium">
        <span class="required">Display name</span>
      </span>
      <TextInput
        bind:value={draft.displayName}
        valid={nameError === undefined} />
      {#if nameError}
        <span class="field-error txt-body-m-regular">
          <Icon name="warning" />
          {nameError}
        </span>
      {/if}
      <span class="field-hint txt-body-s-regular">
        How you appear across devices, not unique to you.
      </span>
    </div>
    <div class="field">
      <span class="field-label txt-body-m-medium">Full name</span>
      <TextInput bind:value={draft.fullName} />
    </div>
    <div class="field compact">
      <span class="field-label txt-body-m-medium">Pronouns</span>
      <div class="picker">
        <PronounsPicker bind:value={draft.pronouns} />
      </div>
    </div>
  </div>

  <div class="row">
    <div class="field">
      <span class="field-label txt-body-m-medium">Location</span>
      <TextInput bind:value={draft.location} />
    </div>
    <div class="field">
      <span class="field-label txt-body-m-medium">Time zone</span>
      <div class="picker">
        <TimezonePicker bind:value={draft.timezone} />
      </div>
    </div>
  </div>

  <div class="field">
    <span class="field-label txt-body-m-medium">
      Bio
      <span class="counter" class:over={bioLeft < 0}>
        {bioLeft} left
      </span>
    </span>
    <TextInput bind:value={draft.bio} valid={bioError === undefined} />
    {#if bioError}
      <span class="field-error txt-body-m-regular">
        <Icon name="warning" />
        {bioError}
      </span>
    {/if}
  </div>

  <div class="field">
    <span class="field-label txt-body-m-medium">About</span>
    <span class="field-description txt-body-m-regular">
      The body of your profile, in Markdown.
      <span class="field-aside">Stored at {README_PATH}.</span>
    </span>
    <Textarea
      bind:value={draft.readme}
      size="resizable"
      styleMinHeight="6rem"
      placeholder="# About me"
      submit={save} />
  </div>

  <div class="field">
    <span class="field-label txt-body-m-medium">
      Links
      <span class="counter">{draft.links.length} of {LIMITS.links}</span>
    </span>
    <span class="field-description txt-body-m-regular">
      Web URLs, mailto: addresses and rad: URIs.
    </span>
    <div class="links">
      {#each draft.links as link (link.id)}
        <div class="link-row">
          <div class="link-url-field">
            <TextInput bind:value={link.url} placeholder="https://" />
          </div>
          <div class="link-label-field">
            <TextInput bind:value={link.label} placeholder="Label" />
          </div>
          <Button
            variant="naked"
            title="Remove link"
            onclick={() => removeLink(link.id)}>
            <Icon name="trash" />
          </Button>
        </div>
      {/each}
      <div>
        <Button
          variant="outline"
          bordered
          disabled={!canAddLink}
          onclick={addLink}>
          <Icon name="plus" />
          Add link
        </Button>
      </div>
    </div>
  </div>

  <div class="permanence">
    <span class="permanence-icon"><Icon name="warning" /></span>
    <span class="txt-body-m-regular">
      Everything here is published to {PROFILE_PATH} and replicated across the network.
      Past values stay in the repository's history even after you change or remove
      them, so treat anything you write as permanent.
      <button
        type="button"
        class="history-link"
        onclick={() => show({ component: ProfileHistory, props: {} })}>
        See what you have published
      </button>
    </span>
  </div>

  <div class="footer">
    {#if changed}
      <span class="footer-note txt-body-m-regular">Unsaved changes</span>
      <Button variant="outline" bordered onclick={discard}>Discard</Button>
    {/if}
    <Button variant="secondary" disabled={!dirty} onclick={save}>
      {#if !prototype.hasProfile}
        Create profile
      {:else if profileEditsApplyDirectly()}
        Save profile
      {:else}
        Propose change
      {/if}
    </Button>
  </div>
</div>
