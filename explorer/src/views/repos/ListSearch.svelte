<script lang="ts" context="module">
  type Qualifier = "author" | "assignee" | "label";

  interface Person {
    did: string;
    alias: string | undefined;
    delegate: boolean;
    activity: number;
  }

  type Suggestion =
    | { type: "qualifier"; key: Qualifier }
    | { type: "person"; key: "author" | "assignee"; person: Person }
    | { type: "label"; label: string };

  interface Token {
    start: number;
    end: number;
    value: string;
  }

  const QUALIFIER_TOKEN = /(^|\s)(author|assignee|label):("[^"]*"?|\S*)/gi;
  const QUALIFIER_VALUE = /^(author|assignee|label):"?(.*?)"?$/i;
  const QUALIFIERS: Qualifier[] = ["author", "assignee", "label"];
  const MAX_SUGGESTIONS = 8;
</script>

<script lang="ts">
  import type { BaseUrl, Issue, Patch, Repo } from "@http-client";
  import type { CobFilters } from "./router";

  import debounce from "lodash/debounce";
  import { createEventDispatcher, onDestroy, tick } from "svelte";

  import { HttpdClient } from "@http-client";
  import { hasCobFilters } from "./router";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  export let baseUrl: BaseUrl;
  export let rid: string;
  export let kind: "issues" | "patches";
  export let filters: CobFilters;
  export let placeholder: string;
  export let delegates: Repo["delegates"];

  const api = new HttpdClient(baseUrl);
  const dispatch = createEventDispatcher<{ change: CobFilters }>();

  let input: HTMLInputElement | undefined = undefined;
  export let expanded: boolean = false;
  let focused = false;
  let text = "";
  let caret = 0;
  let highlighted = -1;
  let dismissed = false;
  let loaded = false;
  let people: Person[] = [];
  let labels: string[] = [];

  $: syncFromRoute(filters, people);
  $: if (expanded || hasCobFilters(filters)) loadSuggestions();
  $: active = activeToken(text, caret);
  $: suggestions = focused && !dismissed ? suggest(active, people, labels) : [];
  $: {
    void suggestions;
    highlighted = 0;
  }

  function isMobile(): boolean {
    return window.matchMedia("(max-width: 719.98px)").matches;
  }

  function syncFromRoute(next: CobFilters, _people: Person[]) {
    if (hasCobFilters(next) && !isMobile()) {
      expanded = true;
    }
    if (!focused) {
      text = compose(next);
    }
  }

  const byDid: Record<string, Person> = {};

  function addPerson(
    did: string,
    alias: string | undefined,
    delegate: boolean,
    activity: number = 0,
  ) {
    const existing = byDid[did];
    byDid[did] = {
      did,
      alias: alias ?? existing?.alias,
      delegate: delegate || (existing?.delegate ?? false),
      activity: (existing?.activity ?? 0) + activity,
    };
  }

  function publishPeople() {
    people = Object.values(byDid).sort(
      (a, b) =>
        Number(b.delegate) - Number(a.delegate) ||
        b.activity - a.activity ||
        Number(Boolean(b.alias)) - Number(Boolean(a.alias)) ||
        (a.alias ?? a.did).localeCompare(b.alias ?? b.did),
    );
  }

  function participants(
    item: Issue | Patch,
  ): Array<{ id: string; alias?: string }> {
    if ("discussion" in item) {
      return [
        item.author,
        ...item.assignees,
        ...item.discussion.map(comment => comment.author),
      ];
    }
    return [
      item.author,
      ...item.assignees,
      ...item.revisions.flatMap(revision => [
        revision.author,
        ...revision.discussions.map(comment => comment.author),
        ...revision.reviews.map(review => review.author),
      ]),
    ];
  }

  function loadSuggestions() {
    if (loaded) {
      return;
    }
    loaded = true;

    for (const delegate of delegates) {
      addPerson(delegate.id, delegate.alias, true);
    }
    publishPeople();

    void api.repo
      .getAllRemotes(rid)
      .then(remotes => {
        for (const remote of remotes) {
          addPerson(`did:key:${remote.id}`, remote.alias, remote.delegate);
        }
        publishPeople();
      })
      .catch(() => undefined);

    void Promise.all(
      kind === "issues"
        ? (["open", "closed"] as const).map(status =>
            api.repo
              .getAllIssues(rid, { status, page: 0, perPage: 100 })
              .catch(() => []),
          )
        : (["open", "draft", "archived", "merged"] as const).map(status =>
            api.repo
              .getAllPatches(rid, { status, page: 0, perPage: 100 })
              .catch(() => []),
          ),
    ).then(pages => {
      const items: Array<Issue | Patch> = pages.flat();
      const labelSet: string[] = [];
      for (const item of items) {
        for (const label of item.labels) {
          if (!labelSet.includes(label)) {
            labelSet.push(label);
          }
        }
        for (const person of participants(item)) {
          addPerson(person.id, person.alias, false, 1);
        }
      }
      labels = labelSet.sort((a, b) => a.localeCompare(b));
      publishPeople();
    });
  }

  function uniqueAlias(person: Person): string | undefined {
    const alias = person.alias?.toLowerCase();
    if (!alias) {
      return undefined;
    }
    return people.filter(p => p.alias?.toLowerCase() === alias).length === 1
      ? person.alias
      : undefined;
  }

  function personLabel(did: string): string {
    const person = people.find(p => p.did === did);
    return (person && uniqueAlias(person)) ?? did;
  }

  function resolvePerson(value: string): string | undefined {
    if (value.startsWith("did:key:")) {
      return value;
    }
    if (/^z6Mk\w{40,}$/.test(value)) {
      return `did:key:${value}`;
    }
    const matches = people.filter(
      p => p.alias?.toLowerCase() === value.toLowerCase(),
    );
    return matches.length === 1 ? matches[0].did : undefined;
  }

  function quote(value: string): string {
    return /\s/.test(value) ? `"${value}"` : value;
  }

  function compose(next: CobFilters): string {
    const parts: string[] = [];
    if (next.author) {
      parts.push(`author:${personLabel(next.author)}`);
    }
    if (next.assignee) {
      parts.push(`assignee:${personLabel(next.assignee)}`);
    }
    if (next.label) {
      parts.push(`label:${quote(next.label)}`);
    }
    if (next.q) {
      parts.push(next.q);
    }
    return parts.join(" ");
  }

  function parse(value: string): CobFilters {
    const next: CobFilters = {};
    const rest = value.replace(
      QUALIFIER_TOKEN,
      (match, lead: string, key: string, raw: string) => {
        const v = raw.replace(/^"|"$/g, "").trim();
        if (!v) {
          return lead;
        }
        const qualifier = key.toLowerCase() as Qualifier;
        if (qualifier === "label") {
          next.label = v;
          return lead;
        }
        const did = resolvePerson(v);
        if (did) {
          next[qualifier] = did;
          return lead;
        }
        return match;
      },
    );
    const q = rest.replace(/\s+/g, " ").trim();
    if (q) {
      next.q = q;
    }
    return next;
  }

  function activeToken(value: string, pos: number): Token {
    for (const match of value.matchAll(/\S*"[^"]*"?\S*|\S+/g)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (start <= pos && pos <= end) {
        return { start, end, value: match[0] };
      }
    }
    return { start: pos, end: pos, value: "" };
  }

  function suggest(
    token: Token,
    people: Person[],
    labels: string[],
  ): Suggestion[] {
    const match = token.value.match(QUALIFIER_VALUE);
    if (match) {
      const key = match[1].toLowerCase() as Qualifier;
      const partial = match[2].toLowerCase();
      if (key === "label") {
        return labels
          .filter(label => label.toLowerCase().includes(partial))
          .slice(0, MAX_SUGGESTIONS)
          .map(label => ({ type: "label", label }));
      }
      return people
        .filter(
          p =>
            (p.alias ?? "").toLowerCase().includes(partial) ||
            p.did.toLowerCase().includes(partial),
        )
        .slice(0, MAX_SUGGESTIONS)
        .map(person => ({ type: "person", key, person }));
    }

    const partial = token.value.toLowerCase();
    if (partial === "") {
      return [];
    }
    return QUALIFIERS.filter(
      key => key.startsWith(partial) && key !== partial,
    ).map(key => ({ type: "qualifier", key }));
  }

  function sameFilters(a: CobFilters, b: CobFilters): boolean {
    return (
      a.q === b.q &&
      a.author === b.author &&
      a.assignee === b.assignee &&
      a.label === b.label
    );
  }

  function emitNow() {
    emit.cancel();
    const next = parse(text);
    if (!sameFilters(next, filters)) {
      dispatch("change", next);
    }
  }

  const emit = debounce(() => {
    if (!QUALIFIER_VALUE.test(active.value)) {
      emitNow();
    }
  }, 250);

  onDestroy(() => emit.cancel());

  function updateCaret() {
    caret = input?.selectionStart ?? text.length;
  }

  async function select(suggestion: Suggestion) {
    let insert: string;
    if (suggestion.type === "qualifier") {
      insert = `${suggestion.key}:`;
    } else if (suggestion.type === "person") {
      const name = uniqueAlias(suggestion.person) ?? suggestion.person.did;
      insert = `${suggestion.key}:${name} `;
    } else {
      insert = `label:${quote(suggestion.label)} `;
    }
    const token = active;
    const after = text.slice(token.end).replace(/^\s+/, "");
    text = text.slice(0, token.start) + insert + after;
    caret = token.start + insert.length;
    await tick();
    input?.focus();
    input?.setSelectionRange(caret, caret);
    if (suggestion.type !== "qualifier") {
      emitNow();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        highlighted = (highlighted + 1) % suggestions.length;
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        highlighted =
          highlighted <= 0 ? suggestions.length - 1 : highlighted - 1;
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && highlighted >= 0) {
        event.preventDefault();
        void select(suggestions[highlighted]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        dismissed = true;
        return;
      }
    }
    if (event.key === "Enter") {
      event.preventDefault();
      emitNow();
      if (window.matchMedia("(pointer: coarse)").matches) {
        input?.blur();
      }
    } else if (event.key === "Escape") {
      if (text.trim() === "") {
        expanded = false;
      }
      input?.blur();
    }
  }

  function handleInput() {
    dismissed = false;
    updateCaret();
    emit();
  }

  function handleBlur() {
    focused = false;
    emit.cancel();
    emitNow();
    if (text.trim() === "" || isMobile()) {
      expanded = false;
    }
  }

  async function open() {
    expanded = true;
    await tick();
    input?.focus();
  }

  function close() {
    text = "";
    caret = 0;
    emitNow();
    expanded = false;
  }

  function shortDid(did: string): string {
    const id = did.replace("did:key:", "");
    return `${id.slice(0, 6)}…${id.slice(-6)}`;
  }
</script>

<style>
  .root {
    margin-left: auto;
  }
  .root.expanded {
    flex: 1;
    min-width: 16rem;
    max-width: 24rem;
  }
  .field {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    box-sizing: border-box;
    height: var(--button-small-height);
    padding: 0 0.5rem 0 0.75rem;
    background: var(--color-surface-base);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    color: var(--color-text-tertiary);
  }
  .field:hover {
    border-color: var(--color-border-mid);
  }
  .field.focused {
    border-color: var(--color-border-brand);
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  input::placeholder {
    color: var(--color-text-tertiary);
    opacity: 1;
  }
  .clear {
    display: flex;
    align-items: center;
    padding: 0.125rem;
    border: none;
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
  }
  .clear:hover {
    color: var(--color-text-primary);
    background-color: var(--color-surface-mid);
  }
  .dropdown {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    right: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    padding: 0.25rem;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    box-shadow: var(--elevation-low);
  }
  .option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.375rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    white-space: nowrap;
    cursor: pointer;
  }
  .option.highlighted {
    background-color: var(--color-surface-mid);
  }
  .hint {
    margin-left: auto;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-text-quaternary);
  }
  .badge {
    padding: 0 0.25rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-mid);
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
  @media (max-width: 719.98px) {
    .root.expanded {
      flex-basis: 100%;
      min-width: 0;
      max-width: none;
    }
    .label {
      display: none;
    }
    .root:not(.expanded) :global(button) {
      width: var(--button-small-height);
      padding: 0;
      justify-content: center;
    }
  }
</style>

<div class="root" class:expanded>
  {#if expanded}
    <div class="field" class:focused>
      <Icon name="search" />
      <input
        bind:this={input}
        bind:value={text}
        {placeholder}
        spellcheck="false"
        autocomplete="off"
        enterkeyhint="search"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls="list-search-suggestions"
        on:input={handleInput}
        on:keydown={handleKeydown}
        on:keyup={updateCaret}
        on:click={updateCaret}
        on:focus={() => {
          focused = true;
          updateCaret();
        }}
        on:blur={handleBlur} />
      <button
        class="clear"
        aria-label="Close search"
        on:mousedown|preventDefault
        on:click={close}>
        <Icon name="close" />
      </button>
      {#if suggestions.length > 0}
        <div class="dropdown" id="list-search-suggestions" role="listbox">
          {#each suggestions as suggestion, i}
            <div
              role="option"
              tabindex="-1"
              aria-selected={i === highlighted}
              class="option"
              class:highlighted={i === highlighted}
              on:mousedown|preventDefault={() => select(suggestion)}
              on:mouseenter={() => (highlighted = i)}>
              {#if suggestion.type === "qualifier"}
                {suggestion.key}:
              {:else if suggestion.type === "person"}
                <UserAvatar nodeId={suggestion.person.did} styleWidth="1rem" />
                {suggestion.person.alias ?? shortDid(suggestion.person.did)}
                {#if suggestion.person.delegate}
                  <span class="badge">delegate</span>
                {/if}
                {#if suggestion.person.alias}
                  <span class="hint">{shortDid(suggestion.person.did)}</span>
                {/if}
              {:else}
                <Icon name="label" />
                {suggestion.label}
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <Button
      variant={hasCobFilters(filters) ? "gray" : "background"}
      ariaLabel="Search {kind}"
      title="Search {kind}"
      on:click={open}>
      <Icon name="search" />
      <span class="label">Search {kind}</span>
    </Button>
  {/if}
</div>
