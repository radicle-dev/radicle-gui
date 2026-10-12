<script lang="ts">
  import type { Doc } from "@bindings/identity/Doc";
  import type { Revision } from "@bindings/identity/Revision";

  import { authorForNodeId, pluralize } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import IdentityJsonButton from "@app/components/IdentityJsonButton.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import VisibilityBadge from "@app/components/VisibilityBadge.svelte";

  interface Props {
    doc: Doc;
    rid: string;
    revision?: Revision;
  }

  const { doc, rid, revision }: Props = $props();

  // Payloads rendered below; the rest are listed by name.
  const knownPayloads = ["xyz.radicle.project", "xyz.radicle.crefs"];
  const otherPayloads = $derived(
    doc.payloadIds.filter(id => !knownPayloads.includes(id)),
  );
</script>

<style>
  .details {
    min-width: 0;
  }
  .section {
    padding: 0.875rem 0;
  }
  .section + .section {
    border-top: 1px solid var(--color-border-subtle);
  }
  .section-title {
    font: var(--txt-body-m-medium);
    color: var(--color-text-primary);
    margin: 0 0 0.625rem;
  }
  .delegates {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    min-width: 0;
  }
  .delegate-chip {
    display: inline-flex;
    align-items: center;
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    font: var(--txt-body-m-regular);
  }
  .delegates-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.625rem;
  }
  .delegates-head .section-title {
    margin: 0;
  }
  .quorum {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .fields {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    column-gap: 2rem;
    row-gap: 0.5rem;
    align-items: baseline;
    font: var(--txt-body-m-regular);
  }
  .field-label {
    color: var(--color-text-secondary);
  }
  .field-value {
    min-width: 0;
    color: var(--color-text-primary);
    overflow-wrap: anywhere;
    justify-self: start;
  }
  .section-action {
    margin-top: 0.875rem;
  }
  .mono {
    font: var(--txt-code-regular);
  }
  .hint {
    color: var(--color-text-secondary);
  }
  .empty {
    color: var(--color-text-secondary);
  }
  .rules-error {
    display: flex;
    align-items: flex-start;
    gap: 0.375rem;
    margin-bottom: 0.625rem;
    font: var(--txt-body-m-regular);
    color: var(--color-feedback-warning-text);
  }
  .inline-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .rule + .rule {
    margin-top: 0.625rem;
  }
  .rule-pattern {
    font: var(--txt-code-regular);
    color: var(--color-text-primary);
    overflow-wrap: anywhere;
  }
  .rule-detail {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.125rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
</style>

<div class="details">
  <div class="section">
    <div class="delegates-head">
      <h2 class="section-title">Delegates</h2>
      <span class="quorum">
        {doc.majority} of {doc.delegates.length} must sign to change this document
      </span>
    </div>
    <div class="delegates">
      {#each doc.delegates as delegate (delegate.did)}
        <div class="delegate-chip">
          <NodeId {...authorForNodeId(delegate)} />
        </div>
      {/each}
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Document</h2>
    <div class="fields">
      {#if doc.project}
        <span class="field-label">Default branch</span>
        <span class="field-value mono">{doc.project.defaultBranch}</span>
      {/if}
      <span class="field-label">Visibility</span>
      <span class="field-value">
        <VisibilityBadge type={doc.visibility.type} />
      </span>
      {#if doc.visibility.type === "private" && doc.visibility.allow}
        <span class="field-label">Also visible to</span>
        <span class="field-value inline-list">
          {#each doc.visibility.allow as peer (peer.did)}
            <NodeId {...authorForNodeId(peer)} />
          {/each}
        </span>
      {/if}
      <span class="field-label">Default branch threshold</span>
      <span class="field-value">
        {doc.threshold} of {doc.delegates.length}
        <span class="hint">
          — delegates whose {doc.project?.defaultBranch ?? "default"} branch must
          contain the same commit for it to become canonical
        </span>
      </span>
      <span class="field-label">Repository ID</span>
      <span class="field-value mono">
        <Id id={rid} clipboard={rid} label="repository ID" shorten={false} />
      </span>
      <span class="field-label">Document version</span>
      <span class="field-value">{doc.version}</span>
    </div>
    <div class="section-action">
      <IdentityJsonButton raw={doc.raw} {revision} />
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Canonical refs</h2>
    {#if doc.canonicalRefsError}
      <div class="rules-error">
        <Icon name="warning" />
        <span>
          Heartwood rejects these rules: {doc.canonicalRefsError}
        </span>
      </div>
    {/if}
    {#if doc.canonicalRefs.length > 0}
      {#each doc.canonicalRefs as rule (rule.pattern)}
        <div class="rule">
          <div class="rule-pattern">{rule.pattern}</div>
          <div class="rule-detail">
            {#if rule.allow.type === "delegates"}
              <span>
                Canonical once {rule.threshold} of {doc.delegates.length}
                {pluralize("delegate", doc.delegates.length)}
                {rule.threshold === 1 ? "agrees" : "agree"}
              </span>
            {:else if rule.allow.dids.length === 1}
              <span>Canonical as published by</span>
              <NodeId {...authorForNodeId(rule.allow.dids[0])} />
            {:else}
              <span>
                Canonical once {rule.threshold} of these
                {rule.allow.dids.length} peers
                {rule.threshold === 1 ? "agrees" : "agree"}:
              </span>
              {#each rule.allow.dids as peer (peer.did)}
                <NodeId {...authorForNodeId(peer)} />
              {/each}
            {/if}
          </div>
        </div>
      {/each}
    {:else}
      <div class="empty">No canonical-refs rules.</div>
    {/if}
  </div>

  {#if otherPayloads.length > 0}
    <div class="section">
      <h2 class="section-title">Other payloads</h2>
      {#each otherPayloads as payload (payload)}
        <div class="rule">
          <div class="rule-pattern">{payload}</div>
          <div class="rule-detail">
            Not rendered by this app. See the raw document.
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
