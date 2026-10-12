<script lang="ts" module>
  export const addRepoPopoverToggleId = "add-repo-popover-toggle";
</script>

<script lang="ts">
  import type { RepoSummary } from "@bindings/repo/RepoSummary";

  import { z } from "zod";

  import { nodeRunning } from "@app/lib/events";
  import { invoke } from "@app/lib/invoke";
  import { seedTarget } from "@app/lib/seedRepo";
  import useLocalStorage from "@app/lib/useLocalStorage.svelte";
  import { twemoji } from "@app/lib/utils";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import Button from "@app/components/Button.svelte";
  import Command from "@app/components/Command.svelte";
  import ExternalLink from "@app/components/ExternalLink.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";
  import { closeFocused } from "@app/components/Popover.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    reload: () => Promise<void>;
    repos: RepoSummary[];
    seededNotReplicated: string[];
  }

  const { reload, repos, seededNotReplicated }: Props = $props();

  let popoverExpanded: boolean = $state(false);
  let rid = $state("");
  let validationMessage: string | undefined = $state(undefined);

  // Clear validation message when changing the input.
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    rid;

    validationMessage = undefined;
  });

  // Clear input when the popover is closed.
  $effect(() => {
    if (!popoverExpanded) {
      rid = "";
    }
  });

  const tab = useLocalStorage(
    "addRepoPopoverSelectedTab",
    z.union([z.literal("seed"), z.literal("publish")]),
    "seed",
    !window.localStorage,
  );

  async function submit() {
    if (rid.trim() === "") {
      return;
    }

    const target = seedTarget(
      rid,
      seededNotReplicated,
      repos.map(r => r.rid),
    );
    if ("error" in target) {
      validationMessage = target.error;
      return;
    }

    validationMessage = undefined;
    await seed(target.rid);
    await reload();
    rid = "";
    closeFocused();
  }

  async function seed(rid: string) {
    try {
      await invoke<null>("seed", {
        rid: rid,
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Seeding failed", error);
    }
  }
</script>

<style>
  li {
    padding: 0;
  }
</style>

<Popover placement="bottom-start" bind:expanded={popoverExpanded}>
  {#snippet toggle(onclick)}
    <Button
      variant="naked"
      id={addRepoPopoverToggleId}
      onclick={() => {
        onclick();
      }}
      active={popoverExpanded}
      styleWidth="1.5rem"
      styleHeight="1.5rem"
      stylePadding="0">
      <Icon name="plus" />
    </Button>
  {/snippet}

  {#snippet popover()}
    <div
      class="txt-body-m-regular"
      style:line-height="1.625rem"
      style:padding="1rem"
      style:border-radius="var(--border-radius-md)"
      style:border="1px solid var(--color-border-subtle)"
      style:background-color="var(--color-surface-canvas)"
      style:width="32rem">
      <div class="global-flex" style:margin-bottom="1rem">
        <Button
          variant="naked"
          active={tab.value === "seed"}
          onclick={() => {
            tab.value = "seed";
          }}>
          Seed a repo
        </Button>
        <Button
          variant="naked"
          active={tab.value === "publish"}
          onclick={() => {
            tab.value = "publish";
          }}>
          Publish existing
        </Button>
      </div>

      {#if tab.value === "seed"}
        <!-- prettier-ignore -->
        <div style:margin-bottom="1rem" style:color="var(--color-text-primary)">
              You can look for Radicle repos on
              <ExternalLink href="https://radicle.network">
                radicle.network
              </ExternalLink>.
            </div>
        <div style:width="100%">
          <div class="txt-body-l-semibold" style:margin-bottom="0.5rem"></div>
          <div
            class="global-flex"
            style:flex-direction="column"
            style:align-items="flex-start"
            style:gap="1rem">
            <div style:width="100%">
              <div class="global-flex" style:width="100%">
                <TextInput
                  autofocus
                  valid={validationMessage === undefined}
                  bind:value={rid}
                  onSubmit={submit}
                  placeholder="RID, e.g. rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5" />
                <Button
                  variant="secondary"
                  onclick={submit}
                  disabled={rid.trim() === ""}>
                  <Icon name="seed" />
                  Seed
                </Button>
              </div>
              {#if validationMessage}
                <div
                  class="txt-body-m-regular global-flex"
                  style:color="var(--color-feedback-error-text)"
                  style:padding="0.25rem 0 0 0.25rem"
                  style:gap="0.25rem">
                  <Icon name="warning" />
                  {validationMessage}
                </div>
              {/if}
            </div>
          </div>
        </div>
        <div
          class="global-flex txt-missing"
          style:align-items="flex-start"
          style:margin-top="2rem">
          By seeding a repository, your node fetches it from the network,
          allowing you to interact with it locally while also making it
          available to others.
        </div>
        {#if !$nodeRunning}
          <div
            class="global-flex txt-missing"
            style:align-items="flex-start"
            style:margin-top="1rem">
            <div>
              Your node is Offline. You can still add repos, but they will only
              be fetched once your node is back online.
            </div>
          </div>
        {/if}
      {:else if tab.value === "publish"}
        <p style="margin: 0 0 1rem 0" style:color="var(--color-text-primary)">
          Navigate to an existing Git repo in your terminal
          <code
            style:white-space="nowrap"
            style:padding="0.125rem 0.25rem"
            style:background-color="var(--color-surface-subtle)">
            cd path/to/your/repo
          </code>
          and run the following command:
        </p>

        <Command styleWidth="fit-content" command="rad init" />

        <p style="margin: 1rem 0 0 0" style:color="var(--color-text-primary)">
          Follow the setup prompts to initialize the repo and publish it on the
          Radicle network:
        </p>

        <ul style:padding="0 1rem">
          <li>
            <strong>Repository Name:</strong>
            The name of your repo.
          </li>
          <li>
            <strong>Description:</strong>
            A brief summary of what your repo does.
          </li>
          <!-- prettier-ignore -->
          <li>
                <strong>Default Branch:</strong>
                Typically
                <strong>main</strong>
                or
                <strong>master</strong>.
              </li>
          <li>
            <strong>Visibility:</strong>
            Choose
            <strong>public</strong>
            to share with others or
            <strong>private</strong>
            to not publish it to the network yet.
          </li>
        </ul>
        <p use:twemoji style:margin="2rem 0 0 0">
          That's it! Your repo is now on the Radicle network.
        </p>
      {/if}
    </div>
  {/snippet}
</Popover>
