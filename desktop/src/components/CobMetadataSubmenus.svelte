<script lang="ts">
  import type { Author } from "@bindings/cob/Author";

  import AssigneesSubmenu from "@app/components/AssigneesSubmenu.svelte";
  import ContextSubmenu from "@app/components/ContextSubmenu.svelte";
  import LabelsSubmenu from "@app/components/LabelsSubmenu.svelte";

  type MetadataAction =
    | { type: "label"; labels: string[] }
    | { type: "assign"; assignees: Author[] };

  interface Props {
    labels: string[];
    assignees: Author[];
    candidates: Author[];
    labelSuggestions: string[];
    edit: (action: MetadataAction) => void;
  }

  const { labels, assignees, candidates, labelSuggestions, edit }: Props =
    $props();
</script>

<ContextSubmenu label="Labels" icon="label">
  <LabelsSubmenu
    {labels}
    suggestions={labelSuggestions}
    save={labels => edit({ type: "label", labels })} />
</ContextSubmenu>
<ContextSubmenu label="Assign" icon="avatar-incognito">
  <AssigneesSubmenu
    {assignees}
    {candidates}
    save={assignees => edit({ type: "assign", assignees })} />
</ContextSubmenu>
