<script lang="ts">
  import type { Author } from "@bindings/cob/Author";
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { Config } from "@bindings/config/Config";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { nodeRunning } from "@app/lib/events";
  import { invoke } from "@app/lib/invoke";
  import * as roles from "@app/lib/roles";
  import { authorForNodeId } from "@app/lib/utils";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import AssigneeInput from "@app/components/AssigneeInput.svelte";
  import IdChip from "@app/components/IdChip.svelte";
  import LabelInput from "@app/components/LabelInput.svelte";
  import NodeId from "@app/components/NodeId.svelte";

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

  let labelSaveInProgress: boolean = $state(false);
  let assigneesSaveInProgress: boolean = $state(false);

  async function saveLabels(labels: string[]) {
    try {
      labelSaveInProgress = true;
      await invoke("edit_issue", {
        rid: repo.rid,
        cobId: issue.id,
        action: { type: "label", labels },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Editing labels failed", error);
    } finally {
      labelSaveInProgress = false;
      await reload();
    }
  }

  async function saveAssignees(assignees: Author[]) {
    try {
      assigneesSaveInProgress = true;
      await invoke("edit_issue", {
        rid: repo.rid,
        cobId: issue.id,
        action: { type: "assign", assignees },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Editing assignees failed", error);
    } finally {
      assigneesSaveInProgress = false;
      await reload();
    }
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
</style>

<div class="meta-row">
  <div class="author-chip" title="Issue author">
    <NodeId {...authorForNodeId(issue.author)} />
  </div>
  <IdChip id={issue.id} label="issue ID" />
  <LabelInput
    allowedToEdit={isDelegate}
    labels={issue.labels}
    submitInProgress={labelSaveInProgress}
    save={saveLabels} />
  <AssigneeInput
    delegates={repo.delegates}
    allowedToEdit={isDelegate}
    assignees={issue.assignees}
    submitInProgress={assigneesSaveInProgress}
    save={saveAssignees} />
</div>
