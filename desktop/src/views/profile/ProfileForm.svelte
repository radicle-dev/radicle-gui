<script lang="ts">
  import type { ActorFork } from "@bindings/actor/ActorFork";
  import type { ActorInfo } from "@bindings/actor/ActorInfo";
  import type { ActorProfile } from "@bindings/actor/ActorProfile";
  import type { ProfileLink } from "@bindings/actor/ProfileLink";
  import type { Config } from "@bindings/config/Config";

  import { onDestroy, untrack } from "svelte";

  import { hints } from "@app/lib/hints";
  import { entityUrl } from "@app/lib/mentions";
  import { show } from "@app/lib/modal";
  import { RepoImages } from "@app/lib/repoImages";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import TextInput from "@app/components/TextInput.svelte";
  import ProfileHistory from "@app/modals/ProfileHistory.svelte";

  import { change, describeActorError, isController } from "./actor";
  import ExplorerPreview from "./ExplorerPreview.svelte";
  import {
    compareVersions,
    fieldValue,
    type Form,
    laidOver,
    type MergeField,
    TEXT_FIELDS,
    type TextField,
  } from "./form";
  import HoverCard from "./HoverCard.svelte";
  import ImagePicker, { type PickedImage } from "./ImagePicker.svelte";
  import Notice from "./Notice.svelte";
  import ProfileCreated from "./ProfileCreated.svelte";
  import PronounsPicker from "./PronounsPicker.svelte";
  import SplitNotice from "./SplitNotice.svelte";
  import TimezonePicker from "./TimezonePicker.svelte";

  interface Props {
    actor: ActorInfo | null;
    localDid: string;
    config: Config;
    // Leaves the form of a profile not created yet.
    oncancel: () => void;
  }

  const { actor, localDid, config, oncancel }: Props = $props();

  // The limits of the profile file, as the backend checks them.
  const LIMITS = { string: 255, label: 64, links: 16 } as const;
  const LINK_SCHEMES = ["https", "http", "mailto", "rad"];
  const IMAGE_SCHEMES = ["https", "http"];
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
      displayName: profile?.displayName ?? "",
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

  // An edit is the profile only once enough controllers carry it, and a
  // save here is carried by this key alone. Where that is not enough, there
  // is no step for the others to take it over, so the profile is only shown.
  const cannotEdit = $derived.by(() => {
    if (actor === null) return undefined;
    if (!isController(actor, localDid)) {
      return "Only a device that controls this profile can edit it. Keys lists which devices do.";
    }
    if (actor.threshold > 1) {
      return `Edits to this profile need ${actor.threshold} controllers to agree, so it is shown here read-only.`;
    }

    return undefined;
  });

  const shown = $derived(actor?.profile);
  const shownHead = $derived(actor?.head);

  // The actor comes from the cache and changes in place, so the form is
  // rebuilt when a different profile head arrives, as after a save.
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
      } else if (same(form, formFrom(base)) && !anyPicked) {
        form = formFrom(shown);
        submitted = false;
      }
      base = shown;
    }
  });

  // The pictures chosen since the last save. Each replaces what its field
  // holds when the profile is saved.
  type ImageField = "avatar" | "banner";
  let picked = $state<Partial<Record<ImageField, PickedImage>>>({});
  const anyPicked = $derived(
    picked.avatar !== undefined || picked.banner !== undefined,
  );

  const images = new RepoImages();
  onDestroy(() => images.dispose());

  // The file in the profile's repository that the saved profile names and
  // the form still does.
  function savedImage(field: ImageField) {
    const path = shown?.[field];
    if (!actor?.head || !path || path.includes(":")) return undefined;
    if (picked[field] || form[field].trim() !== path) return undefined;

    return { rid: actor.rid, head: actor.head, path };
  }

  // The saved pictures the form still names, loaded to show them.
  const savedUrls = $state<Partial<Record<ImageField, string>>>({});
  for (const field of ["avatar", "banner"] as const) {
    $effect(() => {
      const ref = savedImage(field);
      if (!ref) {
        savedUrls[field] = undefined;
        return;
      }

      let gone = false;
      void images
        .load(ref.rid, ref.head, ref.path)
        .then(image => {
          if (!gone) savedUrls[field] = image?.url;
        })
        .catch((e: unknown) => {
          console.warn(`Could not load the ${field} picture`, e);
          if (!gone) savedUrls[field] = undefined;
        });

      return () => {
        gone = true;
      };
    });
  }

  // The picture a field shows: one picked and not saved, or the saved file.
  // One kept at a web address is not fetched, since that would tell its host
  // who is looking.
  function imageSrc(field: ImageField): string | undefined {
    return picked[field]?.url ?? savedUrls[field];
  }

  // The previews show the form as typed, where the profile is seen.
  type Surface = "card" | "explorer";
  let surface = $state<Surface>("card");
  const avatarId = $derived(actor?.rid ?? config.publicKey);
  const previewKeys = $derived(
    actor
      ? actor.keys
          .filter(key => key.bound)
          .map(key => ({ did: key.did, alias: key.alias ?? undefined }))
      : [{ did: localDid, alias: config.alias }],
  );
  const explorerUrl = $derived(
    entityUrl({ type: "node", nid: config.publicKey }, config),
  );

  // Puts another version's value of a field into the form.
  function pickFrom(field: MergeField, from: ActorProfile | undefined) {
    const picked = formFrom(from);
    if (field === "links") form.links = picked.links;
    else form[field] = picked[field];
  }

  // Takes from another version each field only its device changed since
  // the versions split, where the form still holds the profile's value.
  function takeTheirs(fork: ActorFork) {
    if (!actor) return;

    const current = profileFrom(form);
    for (const { field, changedOn } of compareVersions(
      actor.profile,
      fork.profile,
      fork.base,
    )) {
      if (
        changedOn === "theirs" &&
        fieldValue(current, field) === fieldValue(actor.profile, field)
      ) {
        pickFrom(field, fork.profile);
      }
    }
  }

  // A version is taken from once, when the split first shows; the user
  // picks the rest.
  const merged: string[] = [];
  $effect(() => {
    if (!actor) return;
    for (const fork of actor.forks) {
      if (merged.includes(fork.head) || fork.profileNewer) continue;
      merged.push(fork.head);
      untrack(() => takeTheirs(fork));
    }
  });

  let submitting = $state(false);
  let submitted = $state(false);
  let submitError = $state<string>();
  // What the last save did, shown briefly beside the button: a message that
  // stays could outlast what it was said of.
  let saved = $state(false);
  // A profile just created is announced once it has loaded, with what to do
  // next.
  let created = $state(false);
  $effect(() => {
    if (!created || !actor) return;
    created = false;
    show({
      component: ProfileCreated,
      props: { actor },
    });
  });
  const SAVED_MS = 4000;
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  // Nothing is saved from here when this device cannot edit the profile, or
  // when a newer app wrote the file: it has fields this one would drop, here
  // or on another controller's version that a save would replace.
  const readOnly = $derived(
    actor !== null &&
      (cannotEdit !== undefined ||
        actor.profileNewer ||
        actor.forks.some(fork => fork.profileNewer)),
  );
  // A form that turns read-only under an edit goes back to the profile: the
  // edit has nowhere to be saved from, and the notice says why.
  $effect(() => {
    if (!readOnly) return;

    untrack(() => {
      form = formFrom(shown);
      picked = {};
      confirmingRemove = undefined;
      submitted = false;
    });
  });
  const changed = $derived(
    actor !== null && (!same(form, formFrom(shown)) || anyPicked),
  );

  $effect(() => {
    if (changed) saved = false;
  });

  // Another controller's version makes the form as it is worth saving: the
  // save is what replaces that version.
  const dirty = $derived(
    actor === null ||
      actor.profile === undefined ||
      changed ||
      actor.forks.length > 0,
  );

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
        text[field] ??=
          "Desktop cannot save this picture. Remove it to save the profile.";
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
    saved = false;

    const updating = actor !== null;

    try {
      await change({
        command: updating ? "update_actor_profile" : "create_actor",
        args: {
          profile: profileFrom(form),
          images: {
            avatar: picked.avatar?.base64,
            banner: picked.banner?.base64,
          },
        },
      });
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
    picked = {};
    submitted = false;

    if (!updating) {
      created = true;
      return;
    }
    saved = true;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (saved = false), SAVED_MS);
  }

  function same(a: Form, b: Form): boolean {
    return JSON.stringify(profileFrom(a)) === JSON.stringify(profileFrom(b));
  }

  // Back to the form as it opened, which holds what only another device
  // changed: a save without it would undo that device's edit.
  function discard() {
    picked = {};
    form = formFrom(shown);
    for (const fork of actor?.forks ?? []) {
      if (!fork.profileNewer) takeTheirs(fork);
    }
    submitted = false;
    submitError = undefined;
  }

  // The row just added, whose URL takes the focus.
  let focusedLink = $state<number>();
  let confirmingRemove = $state<number>();

  function addLink() {
    if (!canAddLink) return;

    const row = linkRow({ url: "", label: undefined });
    focusedLink = row.id;
    form.links.push(row);
  }

  // A row with nothing typed in it goes without asking.
  function askRemoveLink(index: number) {
    const link = form.links[index];
    if (link.url.trim() || link.label?.trim()) confirmingRemove = link.id;
    else removeLink(index);
  }

  function removeLink(index: number) {
    confirmingRemove = undefined;
    form.links.splice(index, 1);
  }

  // The bio grows with what is typed instead of scrolling.
  let bioElement = $state<HTMLTextAreaElement>();
  $effect(() => {
    void form.bio;
    if (bioElement) {
      bioElement.style.height = "0px";
      bioElement.style.height = `${bioElement.scrollHeight + 2}px`;
    }
  });
</script>

<style>
  .columns {
    display: flex;
    align-items: flex-start;
    gap: 2rem;
  }
  .preview-column {
    position: sticky;
    top: 0;
    width: 19rem;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  /* Below this the preview stops earning its column. */
  @media (max-width: 66rem) {
    .columns {
      flex-direction: column;
    }
    .preview-column {
      position: static;
      width: 100%;
      max-width: 22rem;
    }
  }
  .surface-switch {
    display: flex;
    align-items: center;
  }
  .surface-note {
    color: var(--color-text-secondary);
  }
  .form {
    flex: 1;
    min-width: 0;
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
  .confirm {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
  }
  .confirm-text {
    color: var(--color-text-secondary);
  }
  /* Drawn as the app's text inputs are. */
  .bio {
    width: 100%;
    min-height: 2rem;
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-base);
    color: var(--color-text-primary);
    line-height: 1.6;
    resize: none;
    overflow: hidden;
    outline: none;
  }
  .bio:focus {
    border-color: var(--color-border-brand);
  }
  .bio.invalid {
    border-color: var(--color-feedback-error-border);
  }
  .bio[disabled] {
    cursor: not-allowed;
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

<div class="columns">
  <aside class="preview-column">
    <div class="surface-switch">
      <Button
        variant="ghost"
        flatRight
        active={surface === "card"}
        onclick={() => (surface = "card")}>
        Hover card
      </Button>
      <Button
        variant="ghost"
        flatLeft
        active={surface === "explorer"}
        onclick={() => (surface = "explorer")}>
        Explorer
      </Button>
    </div>

    {#if surface === "card"}
      <span class="surface-note txt-body-m-regular">
        Shown when someone hovers your name in the app.
      </span>
      <HoverCard
        {form}
        avatar={imageSrc("avatar")}
        banner={imageSrc("banner")}
        {avatarId}
        did={actor?.rid ?? config.publicKey} />
    {:else}
      <span class="surface-note txt-body-m-regular">
        Your profile on Explorer.
      </span>
      <ExplorerPreview
        {form}
        avatar={imageSrc("avatar")}
        banner={imageSrc("banner")}
        {avatarId}
        keys={previewKeys}
        url={explorerUrl} />
    {/if}
  </aside>

  <div class="form">
    {#if actor?.profileNewer}
      <Notice icon="warning" title="Written by a newer Desktop" tone="warning">
        <span class="txt-body-m-regular">
          This profile was written by a newer version of Desktop. Editing it
          here would drop the fields this version does not know, so it is shown
          as is.
        </span>
      </Notice>
    {:else if actor?.profileUnreadable}
      <Notice icon="warning" title="Profile file not readable" tone="warning">
        <span class="txt-body-m-regular">
          The profile file in the repository is not one this version of Desktop
          can read.
          {#if !cannotEdit}Saving replaces it.{/if}
        </span>
      </Notice>
    {/if}

    {#if actor && actor.forks.length > 0}
      <SplitNotice {actor} current={profileFrom(form)} onpick={pickFrom} />
    {/if}

    {#if cannotEdit}
      <Notice icon="lock" title="Read-only">
        <span class="txt-body-m-regular">{cannotEdit}</span>
      </Notice>
    {/if}

    <ImagePicker
      kind="avatar"
      bind:value={form.avatar}
      src={imageSrc("avatar")}
      picked={picked.avatar}
      fallbackId={avatarId}
      disabled={readOnly}
      error={errorOf("avatar")}
      onpick={image => (picked.avatar = image)} />

    <ImagePicker
      kind="banner"
      bind:value={form.banner}
      src={imageSrc("banner")}
      picked={picked.banner}
      disabled={readOnly}
      error={errorOf("banner")}
      onpick={image => (picked.banner = image)} />

    <div class="row">
      {@render text("displayName", "Display name", {
        required: true,
        // The first thing to type on a new profile; a saved one is read first.
        autofocus: actor === null,
        hint: "This is not unique.",
      })}

      {@render text("fullName", "Full name")}

      <div class="field">
        <span class="field-label txt-body-m-medium">Pronouns</span>
        <div class="picker">
          <PronounsPicker bind:value={form.pronouns} disabled={readOnly} />
        </div>

        {@render fieldError(errorOf("pronouns"))}
      </div>
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
          {bioLeft < 0 ? `${-bioLeft} over` : `${bioLeft} left`}
        </span>
      </span>

      <textarea
        class="bio txt-body-m-regular"
        class:invalid={errorOf("bio") !== undefined}
        rows="1"
        bind:this={bioElement}
        bind:value={form.bio}
        disabled={readOnly}>
      </textarea>

      <span class="field-note txt-body-s-regular">
        Saved as one paragraph. Line breaks become spaces.
      </span>

      {@render fieldError(errorOf("bio"))}
    </div>

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
                placeholder="https://example.com"
                autofocus={link.id === focusedLink}
                disabled={readOnly}
                onSubmit={addLink} />
            </div>

            <div class="link-label-field">
              <TextInput
                bind:value={link.label}
                placeholder="Label"
                disabled={readOnly}
                onSubmit={addLink} />
            </div>

            {#if confirmingRemove === link.id && !readOnly}
              <div class="confirm">
                <span class="confirm-text txt-body-m-regular">Remove?</span>
                <Button
                  variant="ghost"
                  styleHeight="1.75rem"
                  onclick={() => removeLink(index)}>
                  Yes
                </Button>
                <Button
                  variant="outline"
                  styleHeight="1.75rem"
                  onclick={() => (confirmingRemove = undefined)}>
                  Cancel
                </Button>
              </div>
            {:else}
              <Button
                variant="naked"
                title="Remove link"
                disabled={readOnly}
                onclick={() => askRemoveLink(index)}>
                <Icon name="trash" />
              </Button>
            {/if}
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

    <!-- It says the same for every profile, so once read it stays closed. -->
    {#if !hints.isDismissed("profile.permanence") && !readOnly}
      <Notice
        icon="warning"
        tone="warning"
        ondismiss={() => hints.dismiss("profile.permanence")}>
        <span class="txt-body-m-regular">
          Everything you save here is permanent. Every node that has your
          profile copies it and keeps its earlier versions, even after you
          change or remove something.
        </span>
      </Notice>
    {/if}

    <div class="footer">
      {#if submitError}
        <span class="footer-note error txt-body-m-regular">
          {submitError}
        </span>
      {:else if saved}
        <span class="footer-note success txt-body-m-regular">
          <Icon name="checkmark" />
          Saved.
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

      {#if actor}
        <Button
          variant="ghost"
          onclick={() => show({ component: ProfileHistory, props: { actor } })}>
          View history
        </Button>
      {/if}

      <Button variant="secondary" disabled={!canSubmit} onclick={submit}>
        {#if !actor}
          Create profile
        {:else}
          Save profile
        {/if}
      </Button>
    </div>
  </div>
</div>
