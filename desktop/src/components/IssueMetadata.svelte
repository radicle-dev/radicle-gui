<script lang="ts">
  import type { Author } from "@bindings/cob/Author";
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { Config } from "@bindings/config/Config";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { nodeRunning } from "@app/lib/events";
  import { invoke } from "@app/lib/invoke";
  import { show } from "@app/lib/modal";
  import * as roles from "@app/lib/roles";
  import { authorForNodeId } from "@app/lib/utils";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import AssigneeChip from "@app/components/AssigneeChip.svelte";
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IdChip from "@app/components/IdChip.svelte";
  import Label from "@app/components/Label.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import AssigneeModal from "@app/modals/AssigneeModal.svelte";
  import LabelModal from "@app/modals/LabelModal.svelte";

  interface Props {
    config: Config;
    issue: Issue;
    repo: RepoInfo;
    reload: () => Promise<void>;
  }

  const { config, issue, repo, reload }: Props = $props();

  const isDelegate = $derived(
    !!roles.isDelegate(
      config.publicKey,
      repo.delegates.map(delegate => delegate.did),
    ),
  );

  async function saveLabels(labels: string[]) {
    try {
      await invoke("edit_issue", {
        rid: repo.rid,
        cobId: issue.id,
        action: { type: "label", labels },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Editing labels failed", error);
    } finally {
      await reload();
    }
  }

  async function saveAssignees(assignees: Author[]) {
    try {
      await invoke("edit_issue", {
        rid: repo.rid,
        cobId: issue.id,
        action: { type: "assign", assignees },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Editing assignees failed", error);
    } finally {
      await reload();
    }
  }

  function removeLabel(label: string) {
    void saveLabels(issue.labels.filter(l => l !== label));
  }
  function removeAssignee(did: string) {
    void saveAssignees(issue.assignees.filter(a => a.did !== did));
  }

  function openLabels() {
    show({
      component: LabelModal,
      props: { labels: issue.labels, rid: repo.rid, save: saveLabels },
    });
  }
  function openAssignees() {
    show({
      component: AssigneeModal,
      props: { assignees: issue.assignees, save: saveAssignees },
    });
  }
</script>

<style>
  .meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
  }
  .author-chip {
    display: inline-flex;
    align-items: center;
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  .meta-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
</style>

<div class="meta-row">
  <div class="author-chip" title="Issue author">
    <NodeId {...authorForNodeId(issue.author)} />
  </div>
  <IdChip id={issue.id} label="issue ID" />
  <div class="meta-group">
    {#each issue.labels as label (label)}
      <Label
        {label}
        styleHeight="2rem"
        onRemove={isDelegate ? () => removeLabel(label) : undefined} />
    {/each}
    <Button
      variant="outline"
      disabled={!isDelegate}
      title={isDelegate ? undefined : "Only delegates can add labels"}
      onclick={openLabels}>
      <Icon name="label" />
      Add labels
    </Button>
  </div>
  <div class="meta-group">
    {#each issue.assignees as assignee (assignee.did)}
      <AssigneeChip
        {assignee}
        onRemove={isDelegate
          ? () => removeAssignee(assignee.did)
          : undefined} />
    {/each}
    <Button
      variant="outline"
      disabled={!isDelegate}
      title={isDelegate ? undefined : "Only delegates can add assignees"}
      onclick={openAssignees}>
      <Icon name="avatar-incognito" />
      Add assignees
    </Button>
  </div>
</div>
