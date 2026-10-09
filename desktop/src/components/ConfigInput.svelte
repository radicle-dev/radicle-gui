<script lang="ts">
  import type { Config } from "@bindings/config/Config";
  import type { ErrorWrapper } from "@bindings/error/ErrorWrapper";

  import { cachedConfig } from "@app/lib/invoke";

  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    name: string;
    placeholder: string;
    read: (config: Config) => string;
    save: (value: string, config: Config) => Promise<Config>;
    validate: (value: string) => string | undefined;
  }

  const { name, placeholder, read, save, validate }: Props = $props();

  let config: Config | undefined = $state(undefined);
  let value = $state("");
  let error: string | undefined = $state(undefined);
  let saving = $state(false);
  let saved = $state(false);

  const trimmed = $derived(value.trim());
  const invalid = $derived(validate(trimmed));
  const changed = $derived(config !== undefined && trimmed !== read(config));

  void cachedConfig().then(c => {
    config = c;
    value = read(c);
  });

  async function submit() {
    if (!config || !changed || invalid || saving) return;

    saving = true;
    error = undefined;
    try {
      config = await save(trimmed, config);
      cachedConfig.clear();
      value = read(config);
      saved = true;
      setTimeout(() => (saved = false), 2000);
    } catch (e) {
      error = (e as ErrorWrapper).message ?? "Could not save your config";
    } finally {
      saving = false;
    }
  }
</script>

<style>
  .hint {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    overflow-wrap: anywhere;
  }
  .error {
    color: var(--color-feedback-error-text);
  }
</style>

<TextInput
  {name}
  {placeholder}
  disabled={saving || config === undefined}
  valid={!invalid && error === undefined}
  bind:value
  oninput={() => (error = undefined)}
  onSubmit={submit}
  onBlur={submit}
  onDismiss={() => {
    if (config) value = read(config);
    error = undefined;
  }} />
{#if error ?? invalid}
  <span class="hint error">{error ?? invalid}</span>
{:else if saved}
  <span class="hint">Saved to your Radicle config</span>
{/if}
