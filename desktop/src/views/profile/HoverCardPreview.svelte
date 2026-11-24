<script lang="ts">
  import type { Form } from "./form";

  import { truncateId } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import ProfileCard from "@app/components/ProfileCard.svelte";

  interface Props {
    form: Form;
    avatar: string | undefined;
    banner: string | undefined;
    // What the generated avatar is drawn from when there is no picture.
    avatarId: string;
    // The Profile ID, or this device's key before there is a profile.
    did: string;
  }

  const { form, avatar, banner, avatarId, did }: Props = $props();
</script>

<style>
  .did {
    color: var(--color-text-tertiary);
    font: var(--txt-code-regular);
  }
  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    color: var(--color-text-secondary);
  }
</style>

<!-- Inert: the shape of the card other people see, not a working one. -->
<ProfileCard
  displayName={form.displayName.trim()}
  fullName={form.fullName.trim() ? form.fullName : undefined}
  bio={form.bio.trim() ? form.bio : undefined}
  {avatar}
  {banner}
  {avatarId}>
  {#snippet details()}
    <span class="did">{truncateId(did)}</span>

    <span class="action txt-body-m-medium">
      View profile
      <Icon name="open-external" />
    </span>
  {/snippet}
</ProfileCard>
