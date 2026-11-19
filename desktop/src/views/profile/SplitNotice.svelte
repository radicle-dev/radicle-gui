<script lang="ts">
  import type { ActorInfo } from "@bindings/actor/ActorInfo";
  import type { ActorProfile } from "@bindings/actor/ActorProfile";

  import { show } from "@app/lib/modal";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import ProfileVersionModal from "@app/modals/ProfileVersion.svelte";

  import { keyName } from "./actor";
  import { compareVersions, fieldValue, type MergeField } from "./form";
  import Notice from "./Notice.svelte";

  interface Props {
    // An actor with versions of the profile on other controllers' branches.
    actor: ActorInfo;
    // The profile as the form holds it now.
    current: ActorProfile;
    // Puts a version's value of a field into the form.
    onpick: (field: MergeField, from: ActorProfile | undefined) => void;
  }

  const { actor, current, onpick }: Props = $props();

  const LABELS: Record<MergeField, string> = {
    displayName: "Display name",
    fullName: "Full name",
    pronouns: "Pronouns",
    bio: "Bio",
    location: "Location",
    timezone: "Time zone",
    avatar: "Avatar",
    banner: "Banner",
    links: "Links",
  };

  const forks = $derived(
    actor.forks.map(fork => ({
      ...fork,
      name: keyName(actor, fork.did),
      differences: compareVersions(actor.profile, fork.profile, fork.base),
    })),
  );

  const picked = (field: MergeField, from: ActorProfile | undefined) =>
    fieldValue(current, field) === fieldValue(from, field);
</script>

<style>
  .lead {
    color: var(--color-text-primary);
  }
  .compare {
    display: grid;
    grid-template-columns: 7rem 1fr 1fr;
    gap: 0.375rem 0.5rem;
    margin-top: 0.375rem;
    padding: 0.75rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
  }
  .column {
    color: var(--color-text-tertiary);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding-top: 0.5rem;
    color: var(--color-text-primary);
  }
  .note {
    color: var(--color-text-tertiary);
  }
  .option {
    align-self: start;
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-primary);
    font: var(--txt-body-m-regular);
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .option:hover {
    border-color: var(--color-border-mid);
  }
  .option.picked {
    border-color: var(--color-border-brand);
    background-color: var(--color-surface-brand-subtle);
  }
  .value {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    overflow-wrap: anywhere;
  }
  .empty {
    color: var(--color-text-tertiary);
  }
  .check {
    display: flex;
    flex-shrink: 0;
    color: var(--color-text-brand);
    visibility: hidden;
  }
  .picked .check {
    visibility: visible;
  }
  .raw {
    display: flex;
    padding-top: 0.25rem;
  }
</style>

{#snippet value(field: MergeField, from: ActorProfile | undefined)}
  {#if field === "links"}
    {#each from?.links ?? [] as link (link.url)}
      <span>{link.label ? `${link.label}: ` : ""}{link.url}</span>
    {:else}
      <span class="empty">No links</span>
    {/each}
  {:else if fieldValue(from, field)}
    <span>{fieldValue(from, field)}</span>
  {:else}
    <span class="empty">Empty</span>
  {/if}
{/snippet}

{#snippet option(field: MergeField, from: ActorProfile | undefined)}
  <button
    type="button"
    class="option"
    class:picked={picked(field, from)}
    onclick={() => onpick(field, from)}>
    <span class="value">{@render value(field, from)}</span>
    <span class="check"><Icon name="checkmark" /></span>
  </button>
{/snippet}

{#each forks as fork (fork.did)}
  <Notice icon="warning" title={`Also edited on ${fork.name}`} tone="warning">
    {#if fork.profileNewer}
      <span class="txt-body-m-regular">
        The version on {fork.name} was written by a newer Desktop, so this one cannot
        replace it. Save the profile from {fork.name}.
      </span>
    {:else}
      <span class="lead txt-body-m-regular">
        {#if fork.differences.some(d => d.changedOn === "both")}
          Pick which version to keep where both devices changed something, then
          save.
        {:else}
          Its changes are filled in below. Save to publish them.
        {/if}
      </span>

      {#if fork.differences.length > 0}
        <div class="compare txt-body-m-regular">
          <span></span>
          <span class="column txt-body-s-regular">This device</span>
          <span class="column txt-body-s-regular">{fork.name}</span>

          {#each fork.differences as { field, changedOn } (field)}
            <span class="field txt-body-m-medium">
              {LABELS[field]}
              {#if changedOn === "theirs"}
                <span class="note txt-body-s-regular">
                  Only changed on {fork.name}
                </span>
              {/if}
            </span>
            {@render option(field, actor.profile)}
            {@render option(field, fork.profile)}
          {/each}
        </div>
      {/if}

      {#if fork.otherFiles}
        <span class="txt-body-m-regular">
          The version on {fork.name} also changed other files in the repository. Saving
          here leaves them out; they stay in the history.
        </span>
      {/if}
    {/if}

    <div class="raw">
      <Button
        variant="naked"
        styleHeight="1.75rem"
        onclick={() =>
          show({
            component: ProfileVersionModal,
            props: {
              name: fork.name,
              head: fork.head,
              profile: fork.profile,
              changes: fork.changes,
            },
          })}>
        <Icon name="code" />View raw changes
      </Button>
    </div>
  </Notice>
{/each}
