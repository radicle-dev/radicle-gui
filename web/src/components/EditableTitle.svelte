<script lang="ts">
  import Button from "./Button.svelte";
  import Icon from "./Icon.svelte";

  interface Props {
    title: string;
    editable?: boolean;
    onSave?: (title: string) => void;
  }

  const { title, editable = false, onSave }: Props = $props();

  let editing = $state(false);
  let draft = $state("");
  let input: HTMLInputElement | undefined = $state();

  function start() {
    draft = title;
    editing = true;
    setTimeout(() => input?.select());
  }

  function save() {
    if (draft.trim() && draft.trim() !== title) onSave?.(draft.trim());
    editing = false;
  }
</script>

<style>
  .title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
    flex: 1;
    min-width: 0;
  }
  h1 {
    font: var(--txt-heading-m);
    margin: 0;
    word-break: break-word;
  }
  .edit {
    display: flex;
    visibility: hidden;
  }
  .title:is(:hover, :focus-within) .edit {
    visibility: visible;
  }
  input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    height: 2rem;
    padding: 0 0.5rem;
    margin-left: calc(-0.5rem - 1px);
    font: var(--txt-heading-m);
  }
</style>

<div class="title">
  {#if editing}
    <input
      bind:this={input}
      class="input"
      bind:value={draft}
      onkeydown={e => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") editing = false;
      }} />
    <Button variant="naked" onclick={() => (editing = false)}>Cancel</Button>
    <Button variant="secondary" onclick={save}>Save</Button>
  {:else}
    <h1>{title}</h1>
    {#if editable}
      <span class="edit">
        <Button variant="naked" styleHeight="1.75rem" title="Edit title" onclick={start}>
          <Icon name="edit" />
        </Button>
      </span>
    {/if}
  {/if}
</div>
