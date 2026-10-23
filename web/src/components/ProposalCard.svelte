<script lang="ts">
  import type { Org, Proposal } from "@app/node/model";

  import { timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";
  import { toast } from "@app/lib/toast.svelte";

  import Avatar from "./Avatar.svelte";
  import Button from "./Button.svelte";
  import PersonLink from "./PersonLink.svelte";

  interface Props {
    org: Org;
    proposal: Proposal;
  }

  const { org, proposal }: Props = $props();

  const isMember = $derived(org.members.some(m => m.person === "self"));
  const voted = $derived(
    proposal.approvals.includes("self") ? "approved" : proposal.rejections.includes("self") ? "rejected" : undefined,
  );
  function vote(approve: boolean) {
    node.do({ type: "vote", org: org.id, proposal: proposal.id, approve });
    const state = node.org(org.id)?.proposals.find(p => p.id === proposal.id)?.state;
    if (state === "applied") toast("Approved and applied", { icon: "checkmark" });
    else if (state === "rejected") toast("Proposal rejected");
    else toast(approve ? "Approval signed" : "Rejection signed");
  }

  const detail = $derived.by(() => {
    const c = proposal.change;
    switch (c.type) {
      case "addMember":
        return `Adds ${node.person(c.person).alias} as ${c.role === "admin" ? "an admin" : "a member"}`;
      case "removeMember":
        return `Removes ${node.person(c.person).alias} from the org`;
      case "editProfile":
        return `Changes the ${c.field} to “${c.value}”`;
      case "setThreshold":
        return `Requires ${c.threshold} of ${org.members.length} members to approve future changes`;
    }
  });
</script>

<style>
  .proposal {
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .top {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }
  .title {
    font: var(--txt-body-m-semibold);
  }
  .detail {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .meta {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }
  .state {
    margin-left: auto;
    font: var(--txt-body-s-semibold);
    white-space: nowrap;
  }
  .votes {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .meter {
    display: flex;
    gap: 0.25rem;
    width: 8rem;
  }
  .meter span {
    flex: 1;
    height: 0.375rem;
    border-radius: var(--border-radius-full);
    background: var(--color-surface-strong);
  }
  .meter span.on {
    background: var(--color-feedback-success-fill);
  }
  .voters {
    display: flex;
    gap: 0.25rem;
  }
  .actions {
    margin-left: auto;
    display: flex;
    gap: 0.5rem;
  }
</style>

<div class="card proposal" id={`proposal-${proposal.id}`}>
  <div class="top">
    <div class="stack" style="gap: 0.25rem; flex: 1;">
      <span class="title">{proposal.title}</span>
      <span class="detail">{detail}</span>
      <span class="meta">
        Proposed by <PersonLink person={proposal.author} avatar={false} /> · {timeAgo(proposal.time)}
      </span>
    </div>
    {#if proposal.state === "applied"}
      <span class="state" style="color: var(--color-feedback-success-text)">Applied</span>
    {:else if proposal.state === "rejected"}
      <span class="state" style="color: var(--color-feedback-error-text)">Rejected</span>
    {/if}
  </div>
  <div class="votes">
    <div class="meter">
      {#each Array(org.threshold) as _, i (i)}<span class:on={i < proposal.approvals.length}></span>{/each}
    </div>
    <span class="muted txt-body-s-medium">
      {Math.min(proposal.approvals.length, org.threshold)} of {org.threshold} approvals
    </span>
    <span class="voters">
      {#each proposal.approvals as p (p)}<Avatar person={p} size="1.25rem" />{/each}
    </span>
    {#if proposal.state === "open" && isMember}
      <div class="actions">
        {#if voted}
          <span class="muted txt-body-s-medium">You {voted} this</span>
        {/if}
        {#if voted !== "rejected"}
          <Button
            variant="naked"
            onclick={() => vote(false)}>
            Reject
          </Button>
        {/if}
        {#if voted !== "approved"}
          <Button
            variant="secondary"
            onclick={() => vote(true)}>
            Approve &amp; sign
          </Button>
        {/if}
      </div>
    {/if}
  </div>
</div>
