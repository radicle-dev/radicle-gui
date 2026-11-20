<script lang="ts">
  import type { ActorInfo } from "@bindings/actor/ActorInfo";

  import { keys } from "@radicle-gui/core/keys";
  import { createQuery, invalidate } from "@radicle-gui/ui/lib/query.svelte";
  import { untrack } from "svelte";

  import { repoList } from "@app/lib/cobQueries";
  import { nodeRunning } from "@app/lib/events";
  import { poll } from "@app/lib/interval";
  import { invoke, InvokeError } from "@app/lib/invoke";
  import { queryClient } from "@app/lib/query";
  import { repoListScope } from "@app/lib/repoListScope";
  import { seedRepo } from "@app/lib/seedRepo";
  import { parseRepositoryId, publicKeyFromDid } from "@app/lib/utils";

  import ActorAvatar from "@app/components/ActorAvatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Clipboard from "@app/components/Clipboard.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Spinner from "@app/components/Spinner.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  import { describeActorError, keyKind, profileName, roleText } from "./actor";
  import KeyChunks from "./KeyChunks.svelte";
  import Notice from "./Notice.svelte";

  interface Props {
    // This device's key, which the approving device shows from the code.
    publicKey: string;
    // This device's name, shown with its key.
    alias: string;
    oncancel: () => void;
  }

  const { publicKey, alias, oncancel }: Props = $props();

  let rid = $state("");
  let working = $state(false);
  let error = $state<string>();
  let code = $state<string>();

  const EXAMPLE_ID = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";
  // The ID as the lists of repositories write it, however it was entered.
  const target = $derived.by(() => {
    const parsed = parseRepositoryId(rid.trim());

    return parsed && `${parsed.prefix}${parsed.pubkey}`;
  });

  // The profile is looked up as its ID is entered and shown, so the user
  // sees whose it is before this device's key consents to anything.
  type Check =
    | { status: "none" }
    | { status: "checking" }
    | { status: "ok"; actor: ActorInfo }
    | { status: "missing"; rid: string }
    // The copy here has no head, so the node fetches nothing more into it.
    | { status: "stuck"; rid: string; message: string }
    | { status: "failed"; message: string };
  let check = $state<Check>({ status: "none" });
  // Only the answer to the latest lookup counts.
  let latest = 0;

  async function lookup(id: string): Promise<void> {
    const mine = ++latest;
    check = { status: "checking" };

    let found: Check;
    try {
      const actor = await invoke<ActorInfo>("joinable_actor", { rid: id });
      found = { status: "ok", actor };
    } catch (e) {
      found = refusal(id, e);
    }
    if (mine === latest) check = found;
  }

  function refusal(id: string, e: unknown): Check {
    if (e instanceof InvokeError && e.code === "ActorError.NotFetched") {
      return { status: "missing", rid: id };
    }
    if (e instanceof InvokeError && e.code === "ActorError.CopyStuck") {
      return { status: "stuck", rid: id, message: e.message };
    }

    return {
      status: "failed",
      message: describeActorError(e, "Could not look up the profile."),
    };
  }

  // A lookup scans every repository, so it waits for the typing to stop.
  const CHECK_DELAY_MS = 300;
  $effect(() => {
    const id = target;
    latest += 1;
    check = { status: "none" };
    error = undefined;
    if (id === undefined) return;

    const timer = setTimeout(() => void lookup(id), CHECK_DELAY_MS);

    return () => clearTimeout(timer);
  });

  const repoListQuery = createQuery(queryClient, () =>
    repoList(repoListScope.value),
  );
  // The seeded repositories that haven't arrived yet.
  const underway = $derived(
    repoListQuery.current.data?.seededNotReplicated ?? [],
  );
  const fetching = $derived(
    check.status === "missing" && underway.includes(check.rid),
  );

  // A look at a profile that is still awaited: one at a time, and only an
  // answer changes the page, so a lookup that fails leaves it waiting.
  let lookingAgain = false;
  async function lookAgain(id: string): Promise<void> {
    if (lookingAgain) return;
    lookingAgain = true;
    const mine = latest;

    let found: Check;
    try {
      const actor = await invoke<ActorInfo>("joinable_actor", { rid: id });
      found = { status: "ok", actor };
    } catch (e) {
      found = refusal(id, e);
    } finally {
      lookingAgain = false;
    }
    if (
      mine === latest &&
      (found.status === "ok" || found.status === "stuck")
    ) {
      check = found;
    }
  }

  // The missing profile whose fetch was asked for or seen on its way.
  let awaited: string | undefined;

  // When the list last arrived; the query also notifies as a fetch starts,
  // with the list from before it.
  let seenList = 0;

  // The repository list is fetched again once a repository is seeded, when
  // one arrives, and, without the node's events, every few seconds while any
  // is on its way. An awaited profile that is not on its way in a new list
  // may have arrived, however quickly the fetch went. One that stays on its
  // way is looked up at each new list, since a copy the node cannot update
  // never arrives.
  $effect(() => {
    const updatedAt = repoListQuery.current.dataUpdatedAt;
    const fetchingNow = underway;

    untrack(() => {
      if (updatedAt === seenList) return;
      seenList = updatedAt;
      if (check.status !== "missing") return;

      if (fetchingNow.includes(check.rid)) {
        if (awaited === check.rid) void lookAgain(check.rid);
        awaited = check.rid;
      } else if (awaited === check.rid) {
        awaited = undefined;
        void lookup(check.rid);
      }
    });
  });

  // The user asked for this profile by its ID, so fetching it seeds it
  // without asking again.
  async function fetchProfile(target: string) {
    working = true;
    error = undefined;

    // Set before seeding, so that the list the seed brings finds it.
    awaited = target;
    try {
      await seedRepo(target);
    } catch (e) {
      awaited = undefined;
      error = describeActorError(e, "Could not fetch the profile.");
    } finally {
      working = false;
    }
  }

  async function join(target: string) {
    working = true;
    error = undefined;

    try {
      code = await invoke<string>("join_actor", { rid: target });
    } catch (e) {
      error = describeActorError(e, "Could not create a code.");
    } finally {
      working = false;
    }
  }

  async function submit() {
    if (check.status === "ok") {
      await join(check.actor.rid);
    } else if (check.status === "missing" && !fetching && $nodeRunning) {
      // It may have arrived since the last look.
      const id = check.rid;
      await lookup(id);
      if (check.status === "missing") await fetchProfile(id);
    }
  }

  // Storage drops a copy this device never wrote to, so the fetch that
  // follows starts from nothing. The user asked for this profile, so it is
  // seeded again without asking.
  async function fetchAgain(id: string) {
    working = true;
    error = undefined;

    try {
      await invoke<null>("clean", { rid: id });
      await lookup(id);
      if (check.status === "stuck") {
        error = "Could not remove this device's copy of the profile.";
      } else if (check.status === "missing" && $nodeRunning) {
        awaited = id;
        await seedRepo(id);
      }
    } catch (e) {
      error = describeActorError(e, "Could not fetch the profile again.");
    } finally {
      working = false;
    }
  }

  function back() {
    code = undefined;
    if (target !== undefined) void lookup(target);
  }

  async function done() {
    await invalidate(queryClient, { queryKey: keys.actor() });
    oncancel();
  }

  // While the code waits to be approved, the profile page shows the profile
  // as soon as the cache finds this key in one. The node's update of the
  // profile's identity usually tells it, but an approval need not move the
  // refs it watches, so the page also looks every few seconds.
  const APPROVAL_POLL_MS = 5000;
  $effect(() => {
    if (code === undefined) return;

    return poll(
      () => invalidate(queryClient, { queryKey: keys.actor() }),
      APPROVAL_POLL_MS,
    );
  });
</script>

<style>
  .join {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 40rem;
  }
  .title {
    font: var(--txt-body-l-medium);
    color: var(--color-text-primary);
  }
  .text {
    color: var(--color-text-secondary);
  }
  .hint {
    color: var(--color-text-tertiary);
  }
  .error {
    color: var(--color-feedback-error-text);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text-secondary);
  }
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
  .found {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }
  .found-title {
    font: var(--txt-body-l-medium);
    color: var(--color-text-primary);
  }
  .card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    color: var(--color-text-primary);
  }
  .card-head :global(img) {
    border-radius: var(--border-radius-md);
  }
  .card-name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .card-rid {
    color: var(--color-text-tertiary);
    word-break: break-all;
  }
  .devices {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .device {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .device-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    flex-shrink: 0;
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .device-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    color: var(--color-text-primary);
  }
  .device-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .chip {
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    color: var(--color-text-secondary);
  }
  .did {
    font: var(--txt-code-small);
    color: var(--color-text-tertiary);
    word-break: break-all;
  }
  .code {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    font: var(--txt-code-regular);
    color: var(--color-text-primary);
    word-break: break-all;
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .waiting {
    margin-right: auto;
  }
</style>

{#snippet copyable(text: string)}
  <div class="code">
    <span style:flex="1">{text}</span>
    <Clipboard {text} />
  </div>
{/snippet}

{#snippet found(actor: ActorInfo)}
  <div class="found">
    <span class="found-title">Is this your profile?</span>

    <div class="card">
      <div class="card-head">
        <ActorAvatar {actor} styleWidth="2.5rem" />
        <div class="card-name">
          {#if actor.profileUnreadable}
            <span class="text txt-body-m-regular">
              Its profile file is not one this version of Desktop can read.
            </span>
          {:else}
            <span class="txt-heading-s">{profileName(actor)}</span>
            {#if actor.profile?.fullName}
              <span class="text txt-body-m-regular">
                {actor.profile.fullName}
              </span>
            {/if}
          {/if}
          <span class="card-rid txt-body-s-regular">{actor.rid}</span>
        </div>
        {#if actor.kind === "agent"}
          <span class="chip txt-body-s-regular">Automated agent</span>
        {/if}
      </div>

      <div class="devices">
        {#each actor.keys as key (key.did)}
          {@const role = roleText[keyKind(key)]}

          <div class="device">
            <span class="device-icon"><Icon name="key" /></span>
            <div class="device-text">
              <div class="device-name">
                <!-- Only a label: a look-alike can copy it. -->
                <span class="txt-body-m-medium">{key.alias ?? "Unnamed"}</span>
                {#if role}
                  <span class="chip txt-body-s-regular">{role}</span>
                {/if}
              </div>
              <!-- Whole, since a look-alike only has to match what is shown. -->
              <span class="did">{publicKeyFromDid(key.did)}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>

    {#if actor.payloadNewer}
      <Notice icon="warning" tone="warning">
        <span class="txt-body-s-regular">
          Written by a newer Desktop or another app. It may hold keys this
          version does not show.
        </span>
      </Notice>
    {/if}

    <span class="hint txt-body-s-regular">
      Nothing changes until your other devices approve this one.
    </span>
  </div>
{/snippet}

<div class="join">
  <span class="title">Join existing profile</span>
  {#if code}
    <span class="text txt-body-m-regular">
      Paste this code on a device that has your profile, under Keys → Add key.
    </span>

    {@render copyable(code)}

    <span class="text txt-body-m-regular">
      It will show this device's key. Check that it matches.
    </span>

    <KeyChunks {publicKey} name={alias} />

    <div class="actions">
      <span class="status waiting txt-body-m-regular">
        <Spinner />
        Waiting for approval…
      </span>
      <!-- Creating a code writes nothing, so the profile can be looked at again. -->
      <Button variant="outline" bordered onclick={back}>Back</Button>
      <Button variant="secondary" onclick={() => void done()}>Done</Button>
    </div>
  {:else}
    <div class="step">
      <span class="step-number">1</span>
      <span class="text txt-body-m-regular">
        On a device that already has your profile, open Profile and copy the
        Profile ID.
      </span>
    </div>

    <div class="step">
      <span class="step-number">2</span>
      <div class="step-body">
        <span class="text txt-body-m-regular">Paste it here.</span>

        <TextInput
          bind:value={rid}
          placeholder="Profile ID, e.g. {EXAMPLE_ID}"
          disabled={working || fetching}
          autofocus
          onSubmit={() => void submit()} />

        {#if rid.trim() && target === undefined}
          <span class="hint txt-body-s-regular">
            That is not a Profile ID. One looks like {EXAMPLE_ID}.
          </span>
        {:else if check.status === "missing" && !$nodeRunning}
          <!-- The code signs the profile's current state, which only a copy
               of it gives, and a stopped node fetches none. -->
          <Notice icon="warning" tone="warning">
            <span class="txt-body-m-regular">
              Your node is offline. Start it to fetch this profile.
            </span>
          </Notice>
        {:else if fetching}
          <span class="status txt-body-m-regular">
            <Spinner />
            Fetching the profile from the network…
          </span>
        {:else if check.status === "checking"}
          <span class="status txt-body-m-regular">Looking up the profile…</span>
        {:else if check.status === "missing"}
          <span class="status txt-body-m-regular">
            This profile is not on this device yet. Fetch it to see whose it is.
          </span>
        {:else if check.status === "stuck"}
          <Notice icon="warning" tone="warning">
            <span class="txt-body-m-regular">{check.message}</span>
          </Notice>
        {:else if check.status === "failed"}
          <span class="error txt-body-m-regular">{check.message}</span>
        {:else if check.status === "ok"}
          {@render found(check.actor)}
        {/if}

        {#if error}
          <span class="error txt-body-m-regular">{error}</span>
        {/if}
      </div>
    </div>

    <div class="actions">
      <Button variant="outline" bordered onclick={oncancel}>Cancel</Button>
      {#if check.status === "missing"}
        <Button
          variant="secondary"
          disabled={fetching || working || !$nodeRunning}
          onclick={submit}>
          Fetch the profile
        </Button>
      {:else if check.status === "stuck"}
        {@const id = check.rid}

        <Button
          variant="secondary"
          disabled={working}
          onclick={() => fetchAgain(id)}>
          Fetch again
        </Button>
      {:else}
        <Button
          variant="secondary"
          disabled={check.status !== "ok" || working}
          onclick={submit}>
          Create code
        </Button>
      {/if}
    </div>
  {/if}
</div>
