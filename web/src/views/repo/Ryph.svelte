<script lang="ts">
  import type { AgentKey, Repo } from "@app/node/model";

  import { plural, shortDate } from "@app/lib/utils";
  import { AGENTS, checksFor } from "@app/node/ryph";
  import { node } from "@app/node/node.svelte";
  import { toast } from "@app/lib/toast.svelte";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Empty from "@app/components/Empty.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Hint from "@app/components/Hint.svelte";
  import PersonLink from "@app/components/PersonLink.svelte";
  import RyphRunCard from "@app/components/RyphRunCard.svelte";

  interface Props {
    repo: Repo;
  }

  const { repo }: Props = $props();

  const conn = $derived(node.ryphFor(repo));
  const runs = $derived(node.ryphRuns(repo));
  const delegate = $derived(node.isDelegate(repo));
  const running = $derived(runs.filter(r => !r.finished));
  const done = $derived(runs.filter(r => r.finished));

  let instance = $state("");
  let picked = $state<AgentKey[]>(["agent-mender", "agent-scout", "agent-sweeper"]);

  function connect() {
    const host = instance.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    node.do({ type: "ryphConnect", rid: repo.rid, instance: host, agents: picked });
    toast(`Connected to ${host}`, { icon: "online" });
  }

  function disconnect() {
    if (!conn) return;
    const { instance: host, agents } = conn;
    node.do({ type: "ryphDisconnect", rid: repo.rid });
    toast(`Disconnected from ${host}`, {
      icon: "disconnect",
      action: {
        label: "Undo",
        run: () => node.do({ type: "ryphConnect", rid: repo.rid, instance: host, agents }),
      },
    });
  }
</script>

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 19rem;
    gap: 2.5rem;
  }
  h2 {
    margin: 0 0 0.75rem;
  }
  section {
    margin-bottom: 2rem;
  }
  .intro {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 1.25rem;
    margin-bottom: 2rem;
  }
  .intro p {
    margin: 0.25rem 0 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .intro strong {
    font: var(--txt-body-l-semibold);
  }
  .runs {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .agent {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .agent:last-child {
    border-bottom: none;
  }
  .agent .name {
    font: var(--txt-body-m-semibold);
  }
  .agent .does {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .agent code {
    font: var(--txt-code-small);
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0.0625rem 0.3rem;
  }
  .agent .model {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }
  .facts {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  pre {
    margin: 0;
    padding: 0.75rem 1rem;
    font: var(--txt-code-small);
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
    overflow-x: auto;
  }
  .setup {
    max-width: 40rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .setup h1 {
    font: var(--txt-heading-l);
    margin: 0;
  }
  .setup p {
    margin: 0;
    color: var(--color-text-secondary);
    font: var(--txt-body-l-regular);
  }
  .how {
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .how li {
    margin-bottom: 0.375rem;
  }
  .pick {
    display: flex;
    gap: 0.625rem;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    cursor: pointer;
    font: var(--txt-body-m-regular);
  }
  .pick:last-child {
    border-bottom: none;
  }
  @media (max-width: 960px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>

{#if !conn}
  <div class="setup">
    <h1>Bring Ryph agents to {repo.name}</h1>
    <p>
      Ryph runs coding agents on infrastructure you control. Once connected, delegates can
      comment <span class="mono">/ryph mender fix this</span> on an issue and get a patch
      back, with the repo's checks already passing.
    </p>
    <div class="card how">
      <strong style="color: var(--color-text-primary)">How it works on Radicle</strong>
      <ol style="margin: 0; padding-left: 1.25rem;">
        <li>Your Ryph instance runs its own node and seeds this repository.</li>
        <li>It watches issues and patches for <span class="mono">/ryph</span> commands from delegates.</li>
        <li>Agents work in a sandbox and send their work back as patches signed by the instance's node. Nothing is pushed to {repo.defaultBranch}.</li>
      </ol>
    </div>
    {#if delegate}
      <div class="field">
        <label for="instance">Ryph instance</label>
        <input id="instance" class="input" bind:value={instance} placeholder="ryph.example.org" />
        <span class="hint">The address of your team's Ryph deployment.</span>
      </div>
      <div class="field">
        <span class="label">Agents to allow here</span>
        <div class="card">
          {#each AGENTS as a (a.id)}
            <label class="pick">
              <input
                type="checkbox"
                checked={picked.includes(a.id)}
                onchange={() =>
                  (picked = picked.includes(a.id) ? picked.filter(p => p !== a.id) : [...picked, a.id])} />
              <div>
                <div><strong>{a.name}</strong> <span class="caption">/ryph {a.handle}</span></div>
                <div class="muted">{a.does}</div>
              </div>
            </label>
          {/each}
        </div>
      </div>
      <div class="field">
        <span class="label">Checks agents will run</span>
        <pre>{`# .ryph/checks.yml\nchecks:\n${checksFor(repo).map(c => `  - name: ${c}`).join("\n")}`}</pre>
      </div>
      <div>
        <Button
          variant="secondary"
          disabled={!/\./.test(instance) || picked.length === 0}
          onclick={connect}>
          Connect Ryph
        </Button>
      </div>
    {:else}
      <Empty icon="lock" title="Only delegates can connect Ryph">
        Ask one of {repo.delegates.map(d => node.person(d).alias).join(", ")} to set it up.
      </Empty>
    {/if}
  </div>
{:else}
  <Hint id="ryph-connected">
  <div class="card intro">
    <Icon name="lightbulb" size="32" />
    <div style="flex: 1;">
      <strong>Ryph is connected</strong>
      <p>
        Comment <span class="mono">/ryph &lt;agent&gt; &lt;what to do&gt;</span> on any issue or
        patch. Agents reply in the thread and deliver patches signed by
        <span class="mono">{conn.instance}</span>.
      </p>
    </div>
  </div>
  </Hint>

  <div class="layout">
    <div>
      {#if running.length > 0}
        <section>
          <h2 class="section-title">Running now</h2>
          <div class="runs">
            {#each running as r (r.run.id)}
              <RyphRunCard {repo} run={r.run} stepsDone={r.stepsDone} finished={r.finished} checks={r.checks} compact />
            {/each}
          </div>
        </section>
      {/if}
      <section>
        <h2 class="section-title">Runs</h2>
        {#if done.length > 0}
          <div class="runs">
            {#each done as r (r.run.id)}
              <RyphRunCard {repo} run={r.run} stepsDone={r.stepsDone} finished={r.finished} checks={r.checks} compact />
            {/each}
          </div>
        {:else}
          <Empty icon="lightbulb" title="No runs yet">
            Try <span class="mono">/ryph mender fix this</span> on an open issue.
          </Empty>
        {/if}
      </section>
    </div>

    <aside>
      <div>
        <h2 class="section-title">Agents</h2>
        <div class="card">
          {#each conn.agents as id (id)}
            {@const a = node.world.ryph.agents[id]}
            <div class="agent">
              <Avatar person={id} size="1.75rem" />
              <div class="stack" style="gap: 0.125rem;">
                <span class="name">{a.name} <code>/ryph {a.handle}</code></span>
                <span class="does">{a.does}</span>
                <span class="model">{a.model}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
      <div>
        <h2 class="section-title">Checks</h2>
        <pre>{`# .ryph/checks.yml\nchecks:\n${conn.checks.map(c => `  - name: ${c}`).join("\n")}`}</pre>
        <p class="muted txt-body-s-regular">
          Agents run these before submitting, so their patches arrive green.
        </p>
      </div>
      <div>
        <h2 class="section-title">Who can summon agents</h2>
        <div class="facts">
          <span>The {plural(repo.delegates.length, "delegate")} of {repo.name}</span>
          {#each conn.allowlist as p (p)}<PersonLink person={p} />{/each}
          {#if !node.canSummon(repo)}
            <span class="muted">You can watch runs but not start them.</span>
          {/if}
        </div>
      </div>
      <div>
        <h2 class="section-title">Instance</h2>
        <div class="facts">
          <span class="row"><Icon name="globe" />{conn.instance}</span>
          <span class="row"><Icon name="avatar-incognito" />Connected by {node.person(conn.connectedBy).alias} on {shortDate(conn.connectedAt)}</span>
        </div>
        {#if delegate}
          <div style="margin-top: 0.75rem;">
            <Button variant="outline" onclick={disconnect}><Icon name="disconnect" /> Disconnect</Button>
          </div>
        {/if}
      </div>
    </aside>
  </div>
{/if}
