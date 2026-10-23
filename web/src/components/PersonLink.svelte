<script lang="ts">
  import { node } from "@app/node/node.svelte";

  import Avatar from "./Avatar.svelte";

  interface Props {
    person: string;
    avatar?: boolean;
    size?: string;
    // Renders as a chip that hovers like other chips, not like a text link.
    chip?: boolean;
  }

  const { person, avatar = true, size = "1.125rem", chip = false }: Props = $props();
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
  a.chip {
    font-weight: inherit;
    gap: 0.375rem;
  }
  a:not(.chip):hover .alias {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>

<a href={`/@${p.alias}`} class:chip>
  {#if avatar}<Avatar {person} {size} />{/if}
  <span class="alias">{p.alias}</span>
  {#if person === "self"}<span class="you-chip">You</span>{/if}
</a>
