<script lang="ts">
  import { cachedConfig, invoke, InvokeError } from "@app/lib/invoke";
  import { show } from "@app/lib/modal";
  import { fetchingRepos } from "@app/lib/seedRepo";
  import { explorerHost, parseRepositoryId } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Clipboard from "@app/components/Clipboard.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Spinner from "@app/components/Spinner.svelte";
  import TextInput from "@app/components/TextInput.svelte";
  import NotOnThisNode from "@app/modals/NotOnThisNode.svelte";

  import { describeActorError } from "./actor";

  interface Props {
    // This machine's key, which the approving machine shows from the code.
    publicKey: string;
    oncancel: () => void;
  }

  const { publicKey, oncancel }: Props = $props();

  let rid = $state("");
  let working = $state(false);
  // The repository the join found missing on this machine, until it is here.
  let missing = $state<string>();
  let error = $state<string>();
  let code = $state<string>();

  const valid = $derived(parseRepositoryId(rid.trim()) !== undefined);

  // The sidebar polls a seeded repository until it is fetched; the join runs
  // again once the one it found missing leaves that list.
  const fetching = $derived(
    missing !== undefined && $fetchingRepos.includes(missing),
  );
  let wasFetching = false;

  $effect(() => {
    if (fetching) {
      wasFetching = true;
    } else if (wasFetching) {
      wasFetching = false;
      void attempt(false);
    }
  });

  // Seeding is the user's own step, in the dialog Desktop opens for any
  // repository that is not here; it is offered on a press, not on a retry.
  async function attempt(ask: boolean) {
    const target = rid.trim();
    working = true;
    error = undefined;
    missing = undefined;

    try {
      code = await invoke<string>("join_actor", { rid: target });
    } catch (e) {
      if (e instanceof InvokeError && e.code === "ActorError.NotFetched") {
        missing = target;
        if (ask) {
          const config = await cachedConfig();
          show({
            component: NotOnThisNode,
            props: { rid: target, host: explorerHost(config) },
          });
        }
      } else {
        error = describeActorError(e, "Could not join the profile.");
      }
    } finally {
      working = false;
    }
  }
</script>

<style>
  .join {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 34rem;
  }
  .title {
    font: var(--txt-body-l-medium);
    color: var(--color-text-primary);
  }
  .text {
    color: var(--color-text-secondary);
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
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>

{#snippet copyable(text: string)}
  <div class="code">
    <span style:flex="1">{text}</span>
    <Clipboard {text} />
  </div>
{/snippet}

<div class="join">
  <span class="title">Join an existing profile</span>
  {#if code}
    <span class="text txt-body-m-regular">
      On a machine that already has your profile, open Profile, then Keys, then
      Add key, and paste this code. Your profile shows up here once it is
      approved there and this machine has synced.
    </span>

    {@render copyable(code)}

    <span class="text txt-body-m-regular">
      The other machine shows the key the code is for. Check it is this
      machine's, character for character:
    </span>

    {@render copyable(publicKey)}

    <span class="text txt-body-s-regular">
      The code works until your keys change. If that happens first, make a new
      one here.
    </span>

    <div class="actions">
      <Button variant="outline" bordered onclick={oncancel}>Done</Button>
    </div>
  {:else}
    <span class="text txt-body-m-regular">
      Use this machine as another key of a profile you already have. Enter the
      profile's ID, shown on its Profile page.
    </span>

    <TextInput
      bind:value={rid}
      placeholder="rad:z…"
      disabled={working || fetching}
      autofocus
      onSubmit={() => valid && attempt(true)} />

    {#if fetching}
      <span class="status txt-body-m-regular">
        <Spinner />
        Fetching the profile from the network…
      </span>
    {:else if missing}
      <span class="status txt-body-m-regular">
        <Icon name="warning" />
        The profile's repository is not on this machine.
      </span>
    {/if}

    {#if error}
      <span class="error txt-body-m-regular">
        <Icon name="warning" />
        {error}
      </span>
    {/if}

    <div class="actions">
      <Button variant="outline" bordered onclick={oncancel}>Cancel</Button>
      <Button
        variant="secondary"
        disabled={!valid || working || fetching}
        onclick={() => attempt(true)}>
        Make a code
      </Button>
    </div>
  {/if}
</div>
