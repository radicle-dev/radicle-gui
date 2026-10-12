<script lang="ts">
  import type { Change } from "@bindings/identity/Change";

  import { authorForNodeId, unreachable } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import NodeId from "@app/components/NodeId.svelte";

  interface Props {
    changes: Change[];
    // An empty change list means something different for the root.
    root?: boolean;
  }

  const { changes, root = false }: Props = $props();
</script>

<style>
  .changes {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .change {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .icon {
    display: inline-flex;
    flex-shrink: 0;
  }
  .added {
    color: var(--color-feedback-success-text);
  }
  .removed {
    color: var(--color-feedback-error-text);
  }
  .neutral {
    color: var(--color-text-secondary);
  }
  .label {
    color: var(--color-text-secondary);
  }
  .from {
    color: var(--color-text-secondary);
    text-decoration: line-through;
  }
  .value {
    font: var(--txt-code-regular);
    color: var(--color-text-primary);
  }
  .empty {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
</style>

<div class="changes">
  {#each changes as change}
    <div class="change">
      {#if change.type === "delegateAdded"}
        <span class="icon added"><Icon name="plus" /></span>
        <span class="label">Added delegate</span>
        <NodeId {...authorForNodeId(change.delegate)} />
      {:else if change.type === "delegateRemoved"}
        <span class="icon removed"><Icon name="minus" /></span>
        <span class="label">Removed delegate</span>
        <NodeId {...authorForNodeId(change.delegate)} />
      {:else if change.type === "thresholdChanged"}
        <span class="icon neutral"><Icon name="badge" /></span>
        <span class="label">Threshold</span>
        <span class="from value">{change.from}</span>
        <Icon name="arrow-right" />
        <span class="value">{change.to}</span>
      {:else if change.type === "allowAdded"}
        <span class="icon added"><Icon name="plus" /></span>
        <span class="label">Allowed to view</span>
        <NodeId {...authorForNodeId(change.peer)} />
      {:else if change.type === "allowRemoved"}
        <span class="icon removed"><Icon name="minus" /></span>
        <span class="label">No longer allowed to view</span>
        <NodeId {...authorForNodeId(change.peer)} />
      {:else if change.type === "visibilityChanged"}
        <span class="icon neutral"><Icon name="eye" /></span>
        <span class="label">Visibility</span>
        <span class="from value">{change.from.type}</span>
        <Icon name="arrow-right" />
        <span class="value">{change.to.type}</span>
      {:else if change.type === "nameChanged"}
        <span class="icon neutral"><Icon name="repository" /></span>
        <span class="label">Name</span>
        <span class="from value">{change.from}</span>
        <Icon name="arrow-right" />
        <span class="value">{change.to}</span>
      {:else if change.type === "descriptionChanged"}
        <span class="icon neutral"><Icon name="document" /></span>
        <span class="label">Description changed</span>
      {:else if change.type === "defaultBranchChanged"}
        <span class="icon neutral"><Icon name="branch" /></span>
        <span class="label">Default branch</span>
        <span class="from value">{change.from}</span>
        <Icon name="arrow-right" />
        <span class="value">{change.to}</span>
      {:else if change.type === "payloadChanged"}
        <span
          class="icon"
          class:added={change.operation === "added"}
          class:removed={change.operation === "removed"}
          class:neutral={change.operation === "updated"}>
          <Icon
            name={change.operation === "added"
              ? "plus"
              : change.operation === "removed"
                ? "minus"
                : "edit"} />
        </span>
        <span class="label">
          Payload {change.operation}
        </span>
        <span class="value">{change.payload}</span>
      {:else}
        {unreachable(change)}
      {/if}
    </div>
  {:else}
    <div class="empty">
      {#if root}
        Establishes the repository's first identity document.
      {:else}
        No changes to the fields shown here. See the raw document for detail.
      {/if}
    </div>
  {/each}
</div>
