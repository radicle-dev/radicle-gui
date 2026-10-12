<script lang="ts">
  import type { Commit } from "@bindings/repo/Commit";

  import debounce from "lodash/debounce";

  import { writeToClipboard } from "@app/lib/invoke";
  import type { GitIdentity } from "@app/lib/utils";
  import * as utils from "@app/lib/utils";

  import HoverPopover from "@app/components/HoverPopover.svelte";
  import Icon from "@app/components/Icon.svelte";

  interface Props {
    commit: Commit;
  }

  const { commit }: Props = $props();

  // Which identity was last copied, so the rows keep independent feedback.
  let copied: string | undefined = $state();

  const coAuthors = $derived(utils.creditedCoAuthors(commit));

  const authorIsCommitter = $derived(
    utils.identityKey(commit.author) === utils.identityKey(commit.committer),
  );

  // Everyone credited on the commit, in the order the popover lists them.
  const people = $derived([
    commit.author,
    ...(authorIsCommitter ? [] : [commit.committer]),
    ...coAuthors,
  ]);
  // The stack fans out on hover, which widens the row, so only the first few
  // get an avatar and the rest are counted. The popover lists them all.
  const STACK_LIMIT = 3;
  const stacked = $derived(people.slice(0, STACK_LIMIT));
  const overflow = $derived(people.length - stacked.length);

  const restoreIcon = debounce(() => {
    copied = undefined;
  }, 1000);

  async function copyIdentity(who: GitIdentity) {
    await writeToClipboard(utils.formatGitIdentity(who));
    copied = utils.identityKey(who);
    restoreIcon();
  }
</script>

<style>
  .avatar {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    border-radius: var(--border-radius-sm);
    object-fit: cover;
  }
  .avatars {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
  /* Everyone credited sits stacked, and the avatars fan apart on hover. The
     ring keeps the top avatar readable against the one behind it on any row
     background. */
  .avatars .avatar + .avatar {
    margin-left: -0.375rem;
    transition: margin-left 150ms ease;
  }
  .avatars:hover .avatar + .avatar {
    margin-left: 0.25rem;
  }
  /* Each avatar overlaps the next, so every one needs the ring and its own
     stacking order rather than only the first. */
  .avatars .avatar {
    position: relative;
    box-shadow: 0 0 0 1px var(--color-border-subtle);
  }
  .avatars .more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: auto;
    min-width: 1rem;
    padding: 0 0.1875rem;
    background-color: var(--color-surface-mid);
    color: var(--color-text-secondary);
    font: var(--txt-body-s-medium);
    font-size: 0.625rem;
  }
  /* The counter carries text, so unlike the avatars it sits beside the stack
     rather than under its last member, which would clip the leading "+". */
  .avatars .avatar + .more {
    margin-left: 0.25rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .avatars .avatar + .avatar {
      transition: none;
    }
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    max-width: 22rem;
  }
  .role + .role {
    padding-top: 0.625rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .role-label {
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .role-person {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
    min-width: 0;
  }
  .role-person + .role-person {
    margin-top: 0.375rem;
  }
  /* The avatar centres against the pair, while the name and the smaller email
     share a baseline rather than each being centred on its own box. */
  .role-text {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    min-width: 0;
  }
  /* The name keeps its full width and the email gives way first, so a long
     address never squeezes out the person it belongs to. */
  .name {
    flex: 0 0 auto;
    white-space: nowrap;
    color: var(--color-text-primary);
  }
  .email-row {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
    flex: 0 1 auto;
    min-width: 0;
    padding: 0.125rem 0.25rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    cursor: pointer;
  }
  .email-row:hover,
  .email-row:focus-visible {
    background-color: var(--color-surface-mid);
  }
  .email-row:hover .email,
  .email-row:focus-visible .email,
  .email-row:hover .email-copy,
  .email-row:focus-visible .email-copy {
    color: var(--color-text-primary);
  }
  .email {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-tertiary);
    font: var(--txt-code-regular);
    font-size: 0.75rem;
  }
  /* With no name to go by the address is the person, so it reads as their
     primary line instead of as a secondary detail. */
  .email-row.nameless .email {
    color: var(--color-text-primary);
    font: var(--txt-body-m-regular);
  }
  .email-copy {
    display: inline-flex;
    align-self: center;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }
</style>

{#snippet role(label: string, members: GitIdentity[])}
  <div class="role">
    <div class="role-label txt-body-s-medium">{label}</div>
    {#each members as who (utils.identityKey(who))}
      <div class="role-person">
        <img class="avatar" alt="" src={utils.gravatarURL(who.email)} />
        <div class="role-text">
          {#if who.name}
            <span class="name txt-body-m-regular">{who.name}</span>
          {/if}
          {#if who.email}
            <button
              type="button"
              class="email-row"
              class:nameless={!who.name}
              title={`Copy "${utils.formatGitIdentity(who)}"`}
              onclick={event => {
                event.stopPropagation();
                void copyIdentity(who);
              }}>
              <span class="email">{who.email}</span>
              <span class="email-copy">
                <Icon
                  name={copied === utils.identityKey(who)
                    ? "checkmark"
                    : "copy"} />
              </span>
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/snippet}

<HoverPopover placement="top-start" stylePadding="0.75rem">
  {#snippet toggle()}
    <div class="avatars">
      {#each stacked as who, index (utils.identityKey(who))}
        <img
          class="avatar"
          alt=""
          title={who.name || who.email}
          style:z-index={people.length - index}
          src={utils.gravatarURL(who.email)} />
      {/each}
      {#if overflow > 0}
        <span class="avatar more">+{overflow}</span>
      {/if}
    </div>
  {/snippet}

  {#snippet popover()}
    <div class="card">
      {#if authorIsCommitter}
        {@render role("Author & committer", [commit.author])}
      {:else}
        {@render role("Author", [commit.author])}
        {@render role("Committer", [commit.committer])}
      {/if}
      {#if coAuthors.length > 0}
        {@render role(
          coAuthors.length === 1 ? "Co-author" : "Co-authors",
          coAuthors,
        )}
      {/if}
    </div>
  {/snippet}
</HoverPopover>
