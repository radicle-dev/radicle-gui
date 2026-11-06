<script lang="ts">
  import type { ActorInfo } from "@bindings/actor/ActorInfo";
  import type { ActorProfile } from "@bindings/actor/ActorProfile";
  import type { ProfileLink } from "@bindings/actor/ProfileLink";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  import {
    approvalText,
    change,
    describeActorError,
    isController,
  } from "./actor";
  import { type Form, laidOver, TEXT_FIELDS, type TextField } from "./form";
  import Notice from "./Notice.svelte";
  import TimezonePicker from "./TimezonePicker.svelte";

  interface Props {
    actor: ActorInfo | null;
    localDid: string;
    // The display name a new profile starts with.
    alias: string;
    // Leaves the form of a profile not created yet.
    oncancel: () => void;
  }

  const { actor, localDid, alias, oncancel }: Props = $props();

  // The limits of the profile file, as the backend checks them.
  const LIMITS = { string: 255, label: 64, links: 16 } as const;
  const LINK_SCHEMES = ["https", "http", "mailto", "rad"];
  const IMAGE_SCHEMES = ["https", "http"];
  const PROFILE_PATH = ".radicle/profile.json";

  let nextLinkId = 0;
  const linkRow = (link: ProfileLink) => ({ ...link, id: nextLinkId++ });

  // What a text field shows besides its label: a description above the
  // input, a hint below it.
  type TextOptions = {
    required?: boolean;
    description?: string;
    hint?: string;
    placeholder?: string;
    autofocus?: boolean;
  };

  function formFrom(profile: ActorProfile | undefined): Form {
    return {
      displayName: profile?.displayName ?? alias,
      fullName: profile?.fullName ?? "",
      pronouns: profile?.pronouns ?? "",
      bio: profile?.bio ?? "",
      location: profile?.location ?? "",
      timezone: profile?.timezone ?? "",
      avatar: profile?.avatar ?? "",
      banner: profile?.banner ?? "",
      links: (profile?.links ?? []).map(linkRow),
    };
  }

  function profileFrom(form: Form): ActorProfile {
    const field = (value: string) => value.trim() || undefined;

    return {
      version: 1,
      displayName: form.displayName.trim(),
      fullName: field(form.fullName),
      pronouns: field(form.pronouns),
      bio: field(form.bio),
      location: field(form.location),
      timezone: field(form.timezone),
      avatar: field(form.avatar),
      banner: field(form.banner),
      links: form.links
        .filter(link => link.url.trim() !== "")
        .map(({ url, label }) => ({
          url: url.trim(),
          label: field(label ?? ""),
        })),
    };
  }

  // An edit becomes canonical only once enough controllers carry it; this
  // key alone does not when it is not a controller or the threshold is above
  // one.
  const proposes = $derived(
    actor !== null && (actor.threshold > 1 || !isController(actor, localDid)),
  );

  const shown = $derived(actor?.profile);
  const shownHead = $derived(actor?.head);

  // The parent reuses this component across routes, so the form is rebuilt
  // when the route brings a different profile, as after a save.
  // svelte-ignore state_referenced_locally
  let form = $state<Form>(formFrom(actor?.profile));

  // svelte-ignore state_referenced_locally
  let lastHead = actor?.head;

  // The profile the form was built from, to tell edits from a clean form.
  // svelte-ignore state_referenced_locally
  let base = actor?.profile;

  $effect(() => {
    if (shownHead !== lastHead) {
      lastHead = shownHead;
      // A create form whose key turned out to have a profile, made elsewhere
      // or just now: what was typed goes over it, so a save does not blank
      // its other fields. Otherwise edits survive a head that moved under
      // them; a save then extends the new head.
      if (base === undefined && shown !== undefined) {
        form = laidOver(form, formFrom(shown), formFrom(undefined));
      } else if (same(form, formFrom(base))) {
        form = formFrom(shown);
        submitted = false;
      }
      base = shown;
    }
  });

  let submitting = $state(false);
  let submitted = $state(false);
  let submitError = $state<string>();
  let saved = $state<"saved" | "proposed">();
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  // A file written by a newer app has fields this one would drop.
  const readOnly = $derived(actor?.profileNewer ?? false);
  const changed = $derived(actor !== null && !same(form, formFrom(shown)));
  const dirty = $derived(
    actor === null || actor.profile === undefined || changed,
  );
  const approval = $derived(actor ? approvalText(actor) : "");

  // Lengths count code points of the trimmed text in NFC, as the limits do.
  const length = (value: string) =>
    Array.from(value.trim().normalize("NFC")).length;
  const tooLong = (value: string, limit: number) => {
    const over = length(value) - limit;
    return over > 0 ? `Too long by ${over} characters.` : undefined;
  };

  const hasScheme = (value: string, schemes: string[]) => {
    const scheme = value.split(":", 1)[0];
    return value.includes(":") && schemes.includes(scheme.toLowerCase());
  };

  // Other clients render these as links and images, so what the backend
  // refuses is refused here too.
  const isImageRef = (value: string) =>
    value.includes(":")
      ? hasScheme(value, IMAGE_SCHEMES)
      : !value.includes("\\") &&
        !value.includes("%") &&
        !value.startsWith("/") &&
        !value.split("/").includes("..");

  // What the backend would refuse, by field; a link's errors by its index.
  const errors = $derived.by(() => {
    const text: Partial<Record<TextField, string>> = {};

    if (form.displayName.trim().length === 0) {
      text.displayName = "Enter a display name.";
    }

    for (const field of TEXT_FIELDS) {
      text[field] ??= tooLong(form[field], LIMITS.string);
    }

    for (const field of ["avatar", "banner"] as const) {
      const image = form[field].trim();
      if (image && !isImageRef(image)) {
        text[field] ??= "A path in the repository or a web URL.";
      }
    }

    const links = form.links.map(link => {
      const url = link.url.trim();
      if (!url) return undefined;
      return (
        tooLong(url, LIMITS.string) ??
        (hasScheme(url, LINK_SCHEMES)
          ? tooLong(link.label ?? "", LIMITS.label)
          : "A web URL, a mailto: address or a rad: URI.")
      );
    });

    const any = Object.values(text).some(Boolean) || links.some(error => error);
    return { text, links, any };
  });

  const errorOf = (field: TextField) =>
    submitted ? errors.text[field] : undefined;

  const bioLeft = $derived(LIMITS.string - length(form.bio));
  const canAddLink = $derived(form.links.length < LIMITS.links);
  const canSubmit = $derived(
    dirty && !readOnly && !submitting && !(submitted && errors.any),
  );

  async function submit() {
    submitted = true;
    if (errors.any) return;

    submitting = true;
    submitError = undefined;
    saved = undefined;

    const updating = actor !== null;
    const proposing = proposes;

    try {
      await change(
        {
          command: updating ? "update_actor_profile" : "create_actor",
          args: { profile: profileFrom(form) },
        },
        "profile",
      );
    } catch (error) {
      submitError = describeActorError(
        error,
        updating
          ? "Could not save the profile."
          : "Could not create the profile.",
        {
          "ActorError.Exists":
            "This key already has a profile, made elsewhere. It is shown here with your edits over it; save again to apply them.",
        },
      );
      return;
    } finally {
      submitting = false;
    }

    form = formFrom(shown);
    base = shown;
    submitted = false;

    if (proposing) {
      saved = "proposed";
    } else if (updating) {
      saved = "saved";
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => (saved = undefined), 2000);
    }
  }

  function same(a: Form, b: Form): boolean {
    return JSON.stringify(profileFrom(a)) === JSON.stringify(profileFrom(b));
  }

  function discard() {
    form = formFrom(shown);
    submitted = false;
    submitError = undefined;
  }

  function addLink() {
    if (!canAddLink) return;

    form.links.push(linkRow({ url: "", label: undefined }));
  }

  function removeLink(index: number) {
    form.links.splice(index, 1);
  }
</script>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
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
  .field-note {
    color: var(--color-text-secondary);
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
  .error {
    color: var(--color-feedback-error-text);
  }
  .success {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-foreground-success);
  }
</style>

{#snippet fieldError(message: string | undefined)}
  {#if message}
    <span class="field-error txt-body-m-regular">
      <Icon name="warning" />
      {message}
    </span>
  {/if}
{/snippet}

{#snippet text(field: TextField, label: string, options: TextOptions = {})}
  <div class="field">
    <span class="field-label txt-body-m-medium">
      {#if options.required}
        <span class="required">{label}</span>
      {:else}
        {label}
      {/if}
    </span>

    {#if options.description}
      <span class="field-note txt-body-m-regular">{options.description}</span>
    {/if}

    <TextInput
      bind:value={form[field]}
      valid={errorOf(field) === undefined}
      placeholder={options.placeholder}
      autofocus={options.autofocus}
      disabled={readOnly} />

    {@render fieldError(errorOf(field))}

    {#if options.hint}
      <span class="field-note txt-body-s-regular">{options.hint}</span>
    {/if}
  </div>
{/snippet}

<div class="form">
  {#if readOnly}
    <Notice icon="warning" title="Written by a newer Desktop">
      <span class="txt-body-m-regular">
        This profile was written by a newer version of Desktop. Editing it here
        would drop the fields this version does not know, so it is shown as is.
      </span>
    </Notice>
  {:else if actor?.profileUnreadable}
    <Notice icon="warning" title="Profile file not readable">
      <span class="txt-body-m-regular">
        The profile file in the repository is not one this version of Desktop
        can read. Saving replaces it.
      </span>
    </Notice>
  {/if}

  {#if proposes && actor}
    <Notice icon="lock" title="Needs approval">
      <span class="txt-body-m-regular">
        Saving will not publish this straight away. It goes live {approval}.
      </span>
    </Notice>
  {/if}

  <div class="row">
    {@render text("displayName", "Display name", {
      required: true,
      // The first thing to type on a new profile; a saved one is read first.
      autofocus: actor === null,
      hint: "How you appear across devices, not unique to you.",
    })}

    {@render text("fullName", "Full name")}

    {@render text("pronouns", "Pronouns")}
  </div>

  <div class="row">
    {@render text("location", "Location")}

    <div class="field">
      <span class="field-label txt-body-m-medium">Time zone</span>
      <div class="picker">
        <TimezonePicker bind:value={form.timezone} disabled={readOnly} />
      </div>

      {@render fieldError(errorOf("timezone"))}
    </div>
  </div>

  <div class="field">
    <span class="field-label txt-body-m-medium">
      Bio
      <span class="counter" class:over={bioLeft < 0}>
        {bioLeft} left
      </span>
    </span>

    <TextInput
      bind:value={form.bio}
      valid={errorOf("bio") === undefined}
      disabled={readOnly} />

    {@render fieldError(errorOf("bio"))}
  </div>

  {@render text("avatar", "Avatar", {
    description:
      "A URL, or a path in the repository, to an image cropped to a square.",
    placeholder: "https://",
  })}

  {@render text("banner", "Banner", {
    description:
      "A URL, or a path in the repository, to a wide image shown above the profile.",
    placeholder: "https://",
  })}

  <div class="field">
    <span class="field-label txt-body-m-medium">
      Links
      <span class="counter">
        {form.links.length} of {LIMITS.links}
      </span>
    </span>

    <span class="field-note txt-body-m-regular">
      Web URLs, mailto: addresses and rad: URIs.
    </span>

    <div class="links">
      {#each form.links as link, index (link.id)}
        {@const linkError = submitted ? errors.links[index] : undefined}

        <div class="link-row">
          <div class="link-url-field">
            <TextInput
              bind:value={link.url}
              valid={linkError === undefined}
              placeholder="https://"
              disabled={readOnly} />
          </div>

          <div class="link-label-field">
            <TextInput
              bind:value={link.label}
              placeholder="Label"
              disabled={readOnly} />
          </div>

          <Button
            variant="naked"
            title="Remove link"
            disabled={readOnly}
            onclick={() => removeLink(index)}>
            <Icon name="trash" />
          </Button>
        </div>

        {@render fieldError(linkError)}
      {/each}

      <div>
        <Button
          variant="outline"
          bordered
          disabled={!canAddLink || readOnly}
          onclick={addLink}>
          <Icon name="plus" />
          Add link
        </Button>
      </div>
    </div>
  </div>

  <Notice icon="warning">
    <span class="txt-body-m-regular">
      Everything here is published to {PROFILE_PATH} and replicated across the network.
      Past values stay in the repository's history even after you change or remove
      them, so treat anything you write as permanent.
    </span>
  </Notice>

  <div class="footer">
    {#if submitError}
      <span class="footer-note error txt-body-m-regular">
        {submitError}
      </span>
    {:else if saved === "saved"}
      <span class="footer-note success txt-body-m-regular">
        <Icon name="checkmark" />
        Saved.
      </span>
    {:else if saved === "proposed"}
      <span class="footer-note txt-body-m-regular">
        Proposed. It goes live {approval}.
      </span>
    {:else if changed}
      <span class="footer-note txt-body-m-regular">Unsaved changes</span>
    {/if}

    {#if changed}
      <Button variant="outline" bordered onclick={discard}>Discard</Button>
    {:else if !actor}
      <Button
        variant="outline"
        bordered
        disabled={submitting}
        onclick={oncancel}>
        Cancel
      </Button>
    {/if}

    <Button variant="secondary" disabled={!canSubmit} onclick={submit}>
      {#if !actor}
        Create profile
      {:else if proposes}
        Propose change
      {:else}
        Save profile
      {/if}
    </Button>
  </div>
</div>
