<script lang="ts">
  import type { Author } from "@bindings/cob/Author";

  import debounce from "lodash/debounce";

  import type { AssigneeSuggestion } from "@app/lib/assigneeSuggestions";
  import {
    matchesAssignee,
    rankAssigneeSuggestions,
  } from "@app/lib/assigneeSuggestions";
  import { positionInputPopover } from "@app/lib/inputPopover";
  import { parseAssignee } from "@app/lib/inputValidation";
  import { cachedSearchAliases, invoke } from "@app/lib/invoke";
  import { portal } from "@app/lib/portal";
  import {
    authorForNodeId,
    publicKeyFromDid,
    truncateId,
  } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import TextInput from "@app/components/TextInput.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  interface Props {
    allowedToEdit: boolean;
    assignees: Author[];
    delegates?: Author[];
    submitInProgress: boolean;
    save: (updatedAssignees: Author[]) => void;
    preview?: boolean;
  }

  const {
    allowedToEdit = false,
    assignees = $bindable(),
    delegates = [],
    submitInProgress = false,
    save,
    preview = false,
  }: Props = $props();

  let updatedAssignees: Author[] = $state([]);
  let showInput: boolean = $state(false);
  let inputValue = $state("");
  const parsed = $derived(parseAssignee(inputValue, updatedAssignees));
  const validationMessage = $derived(parsed.error);
  const valid = $derived(parsed.error === undefined);

  let removeToggles: Record<string, boolean> = $state({});

  const maxSuggestions = 10;

  let focused = $state(false);
  let dismissed = $state(false);
  let suggestions: AssigneeSuggestion[] = $state([]);
  let loadedQuery: string | undefined = $state();
  let activeIndex = $state(0);
  let anchorEl: HTMLDivElement | undefined = $state();
  let floatingEl: HTMLDivElement | undefined = $state();
  const rowElements: (HTMLButtonElement | undefined)[] = [];

  const searching = $derived(
    showInput && focused && !dismissed && parsed.did === undefined,
  );
  const loaded = $derived(loadedQuery === inputValue.trim());
  const open = $derived(searching && loaded && suggestions.length > 0);
  const showError = $derived(showInput && validationMessage !== undefined);
  const noMatches = $derived(
    searching &&
      loaded &&
      parsed.error === undefined &&
      suggestions.length === 0 &&
      loadedQuery !== "",
  );
  const noMatchesMessage = $derived(
    updatedAssignees.some(assignee => matchesAssignee(inputValue, assignee))
      ? "This assignee is already added"
      : `No one matches “${inputValue.trim()}”`,
  );

  const panelVisible = $derived(open || showError || noMatches);

  const loadSuggestions = debounce((query: string) => {
    void collectSuggestions(query)
      .then(collected => {
        if (inputValue.trim() !== query) return;
        suggestions = collected;
        loadedQuery = query;
        activeIndex = query === "" ? -1 : 0;
      })
      .catch(error => {
        console.warn("Not able to load assignee suggestions", error);
        suggestions = [];
      });
  }, 80);

  $effect(() => {
    if (!showInput) {
      loadSuggestions.cancel();
      suggestions = [];
      loadedQuery = undefined;
      return;
    }
    loadSuggestions(inputValue.trim());
  });

  async function collectSuggestions(
    query: string,
  ): Promise<AssigneeSuggestion[]> {
    const aliases = await cachedSearchAliases(query.replace(/^did:key:/, ""));

    return rankAssigneeSuggestions({
      query,
      aliases,
      delegates,
      assignees: updatedAssignees,
      limit: maxSuggestions,
    });
  }

  $effect(() => {
    if (!panelVisible || !floatingEl || !anchorEl) return;
    return positionInputPopover(anchorEl, floatingEl);
  });

  $effect(() => {
    if (!open) return;
    rowElements[activeIndex]?.scrollIntoView({ block: "nearest" });
  });

  function handleKeydown(event: KeyboardEvent): boolean {
    if ((open || noMatches) && event.key === "Escape") {
      dismissed = true;
      return true;
    }
    if (!open) return false;

    switch (event.key) {
      case "ArrowDown":
        activeIndex = (activeIndex + 1) % suggestions.length;
        return true;
      case "ArrowUp":
        activeIndex =
          activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1;
        return true;
      case "Enter":
      case "Tab": {
        const suggestion = suggestions[activeIndex];
        if (!suggestion) return false;
        selectSuggestion(suggestion);
        return true;
      }
      default:
        return false;
    }
  }

  function commit(assignee: Author) {
    updatedAssignees = [...updatedAssignees, assignee];
    inputValue = "";
    save($state.snapshot(updatedAssignees));
    showInput = false;
  }

  function selectSuggestion(suggestion: AssigneeSuggestion) {
    commit({ did: suggestion.did, alias: suggestion.alias });
  }

  $effect(() => {
    // Reset component state whenever the assignees change in the parent. This
    // happens when the issue ID changes for example when the user navigates
    // to a different issue via the sidebar.
    updatedAssignees = assignees;

    showInput = false;
    removeToggles = {};
  });

  async function addAssignee() {
    const assignee = parsed.did;
    if (assignee) {
      const alias = await invoke<string | null>("alias", {
        nid: publicKeyFromDid(assignee),
      });
      commit({ did: assignee, alias: alias ?? undefined });
    }
  }

  function removeAssignee(assignee: Author) {
    updatedAssignees = updatedAssignees.filter(
      ({ did }) => did !== assignee.did,
    );
    save($state.snapshot(updatedAssignees));
    showInput = false;
  }
</script>

<style>
  .row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .input-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .suggestions {
    position: fixed;
    top: 0;
    left: 0;
    visibility: hidden;
    z-index: 400;
    display: flex;
    flex-direction: column;
    max-width: 28rem;
    overflow-y: auto;
    padding: 0.25rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    box-shadow: var(--elevation-low);
  }
  .suggestion {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    color: var(--color-text-primary);
    font: var(--txt-body-m-regular);
    text-align: left;
  }
  .suggestion.selected {
    background-color: var(--color-surface-subtle);
  }
  .suggestion-primary {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .suggestion-primary.mono {
    font-family: var(--font-family-code);
  }
  .suggestion-secondary {
    margin-left: auto;
    padding-left: 0.5rem;
    color: var(--color-text-secondary);
    font: var(--txt-body-s-regular);
    font-family: var(--font-family-code);
  }
  .no-matches,
  .validation-message {
    padding: 0.375rem 0.5rem;
    color: var(--color-text-secondary);
    font: var(--txt-body-m-regular);
  }
  .validation-message {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-feedback-error-text);
  }
  .suggestion-badge {
    flex-shrink: 0;
    padding: 0 0.25rem;
    border-radius: var(--border-radius-tiny);
    background-color: var(--color-fill-ghost);
    color: var(--color-text-secondary);
  }
  button {
    border: 0;
    cursor: pointer;
    gap: 0.5rem;
    background-color: transparent;
    border: none;
    display: flex;
    color: var(--color-text-secondary);
    padding: 0;
    align-items: center;
  }
</style>

{#if preview}
  <div class="row">
    <Button variant="outline" disabled>
      <Icon name="avatar-incognito" />
      {#if updatedAssignees.length === 0}
        Add assignees
      {:else}
        Assignees
      {/if}
    </Button>
    {#each updatedAssignees as assignee}
      <span style:color="var(--color-text-secondary)">
        <NodeId
          {...authorForNodeId(assignee)}
          cardPlacement="top-start"
          cardOffset={12} />
      </span>
    {/each}
  </div>
{:else}
  <div class="row">
    {#if showInput}
      <div class="input-row">
        <div style:flex="1" style:min-width="0" bind:this={anchorEl}>
          <TextInput
            autofocus
            {valid}
            disabled={submitInProgress}
            placeholder="Alias or DID, e.g. did:key:z6MkwPUeUS2…"
            bind:value={inputValue}
            oninput={() => (dismissed = false)}
            onFocus={() => {
              focused = true;
              dismissed = false;
            }}
            onBlur={() => (focused = false)}
            onKeydown={handleKeydown}
            onSubmit={addAssignee} />
        </div>
        {#if panelVisible}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="suggestions"
            bind:this={floatingEl}
            use:portal
            onmousedown={event => event.preventDefault()}>
            {#if showError}
              <div class="validation-message">
                <Icon name="warning" />{validationMessage}
              </div>
            {/if}
            {#each suggestions as suggestion, index (suggestion.did)}
              {@const nid = publicKeyFromDid(suggestion.did)}
              <button
                type="button"
                bind:this={rowElements[index]}
                class="suggestion"
                class:selected={index === activeIndex}
                onmouseenter={() => (activeIndex = index)}
                onmousedown={event => {
                  event.preventDefault();
                  selectSuggestion(suggestion);
                }}>
                <UserAvatar nodeId={nid} styleWidth="1rem" />
                <span
                  class="suggestion-primary"
                  class:mono={suggestion.alias === undefined}>
                  {suggestion.alias ?? truncateId(nid)}
                </span>
                {#if suggestion.badge}
                  <span class="suggestion-badge txt-body-s-medium">
                    {suggestion.badge}
                  </span>
                {/if}
                <span class="suggestion-secondary">
                  {truncateId(nid)}
                </span>
              </button>
            {:else}
              {#if noMatches}
                <div class="no-matches">{noMatchesMessage}</div>
              {/if}
            {/each}
          </div>
        {/if}
        <Button
          variant="outline"
          onclick={() => {
            showInput = false;
            inputValue = "";
          }}>
          <Icon name="close" />
        </Button>
      </div>
    {:else}
      <Button
        variant="outline"
        disabled={!allowedToEdit}
        title={allowedToEdit ? undefined : "Only delegates can add assignees"}
        onclick={() => {
          inputValue = "";
          dismissed = false;
          showInput = true;
        }}>
        <Icon name="avatar-incognito" />
        {#if updatedAssignees.length === 0}
          Add assignees
        {:else}
          Assignees
        {/if}
      </Button>
    {/if}

    {#if allowedToEdit}
      {#each updatedAssignees as assignee}
        <button
          class="txt-body-m-regular"
          onclick={() =>
            (removeToggles[assignee.did] = !removeToggles[assignee.did])}>
          <NodeId
            {...authorForNodeId(assignee)}
            cardPlacement="top-start"
            cardOffset={12} />
          {#if removeToggles[assignee.did]}
            <Icon name="close" onclick={() => removeAssignee(assignee)} />
          {/if}
        </button>
      {/each}
    {:else}
      {#each updatedAssignees as assignee}
        <NodeId
          {...authorForNodeId(assignee)}
          cardPlacement="top-start"
          cardOffset={12} />
      {/each}
    {/if}
  </div>
{/if}
