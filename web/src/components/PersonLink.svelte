<script lang="ts">
  import { node } from "@app/node/node.svelte";

  import Avatar from "./Avatar.svelte";

  interface Props {
    person: string;
    avatar?: boolean;
    size?: string;
  }

  const { person, avatar = true, size = "1.125rem" }: Props = $props();
  const p = $derived(node.person(person));
</script>

<style>
  a {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: inherit;
    text-decoration: none;
    font-weight: 600;
    vertical-align: middle;
  }
  a:hover .alias {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .you {
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
  }
</style>

<a href={`/@${p.alias}`}>
  {#if avatar}<Avatar {person} {size} />{/if}
  <span class="alias">{p.alias}</span>
  {#if person === "self"}<span class="you">(you)</span>{/if}
</a>
