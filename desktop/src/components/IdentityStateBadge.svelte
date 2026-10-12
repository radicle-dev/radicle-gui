<script lang="ts">
  import type { State } from "@bindings/identity/State";

  import { stateCaption, stateIcon, stateLabel } from "@app/lib/identityState";

  import Icon from "@app/components/Icon.svelte";

  interface Props {
    state: State;
  }

  const { state }: Props = $props();
</script>

<style>
  .badge {
    gap: 0.375rem;
    padding-right: 0.625rem;
    font: var(--txt-body-s-regular);
    white-space: nowrap;
  }
  .accepted {
    background-color: var(--color-feedback-success-bg);
    color: var(--color-feedback-success-text);
  }
  .active {
    background-color: var(--color-feedback-warning-bg);
    color: var(--color-feedback-warning-text);
  }
  .rejected {
    background-color: var(--color-feedback-error-bg);
    color: var(--color-feedback-error-text);
  }
</style>

<span
  class="global-chip badge"
  class:accepted={state.status === "accepted"}
  class:active={state.status === "active"}
  class:rejected={state.status === "rejected"}
  title={stateCaption(state)}>
  <Icon name={stateIcon(state)} />
  {stateLabel(state)}
</span>
