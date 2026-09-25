<script lang="ts">
  import debounce from "lodash/debounce";
  import { createEventDispatcher, onDestroy } from "svelte";

  import TextInput from "@app/components/TextInput.svelte";

  export let value: string | undefined = undefined;
  export let placeholder: string;

  const dispatch = createEventDispatcher<{ search: string | undefined }>();

  let query = value ?? "";
  let focused = false;

  $: syncFromRoute(value);

  function syncFromRoute(next: string | undefined) {
    if (!focused) {
      query = next ?? "";
    }
  }

  const emit = debounce(() => {
    const trimmed = query.trim();
    dispatch("search", trimmed.length > 0 ? trimmed : undefined);
  }, 200);

  onDestroy(() => emit.cancel());

  function handleBlur() {
    emit.flush();
    focused = false;
  }
</script>

<style>
  .search {
    display: flex;
    flex: 1;
    min-width: 12rem;
  }
</style>

<div class="search">
  <TextInput
    {placeholder}
    showKeyHint={false}
    bind:value={query}
    on:input={() => emit()}
    on:submit={() => emit.flush()}
    on:focus={() => (focused = true)}
    on:blur={handleBlur} />
</div>
