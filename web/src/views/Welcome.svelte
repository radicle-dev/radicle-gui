<script lang="ts">
  import { describeDevice, generateNid, recoveryPhrase } from "@app/node/identity";
  import { navigate } from "@app/lib/router.svelte";
  import { node } from "@app/node/node.svelte";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  type Step = "intro" | "link" | "name" | "recovery" | "boot";

  let step = $state<Step>(node.ready ? "boot" : "intro");
  let alias = $state("");
  let name = $state("");
  let nid = $state("");
  let words = $state<string[]>([]);
  let saved = $state(false);
  let persisted = $state<boolean | undefined>(undefined);

  const aliasValid = $derived(/^[a-z0-9][a-z0-9_-]{1,23}$/.test(alias));
  const net = node.network;

  async function toName() {
    step = "name";
    if (!nid) nid = await generateNid();
  }

  function toRecovery() {
    words = recoveryPhrase();
    step = "recovery";
  }

  async function boot() {
    step = "boot";
    node.createIdentity({
      alias,
      name: name.trim() || alias,
      nid,
      did: `did:key:${nid}`,
      createdAt: Date.now(),
      device: describeDevice(),
      recoverySaved: saved,
    });
    try {
      persisted = (await navigator.storage?.persist?.()) ?? false;
    } catch {
      persisted = false;
    }
  }

  function download() {
    const text = [
      "Radicle recovery key",
      "",
      `Identity: did:key:${nid}`,
      `Alias: ${alias}`,
      "",
      words.join(" "),
      "",
      "Keep this somewhere safe and offline. Anyone with these words can",
      "recover your identity.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `radicle-recovery-${alias}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    saved = true;
  }

  const checklist = $derived([
    { label: "Keys generated in this browser", done: true },
    {
      label:
        persisted === false
          ? "Storage opened (the browser may clear it under pressure)"
          : "Persistent storage opened",
      done: persisted !== undefined || net.status !== "starting",
    },
    {
      label:
        net.peers.length > 0
          ? `Connected to ${net.peers.length} peer${net.peers.length === 1 ? "" : "s"}`
          : "Connecting to seed nodes",
      done: net.status === "online",
    },
    {
      label: "Syncing repositories you seed",
      done: net.events.some(e => e.kind === "announce"),
    },
  ]);
  const allDone = $derived(checklist.every(c => c.done));
</script>

<style>
  .screen {
    min-height: 100vh;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .side {
    background: var(--color-surface-brand-subtle, var(--color-surface-subtle));
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 3rem;
  }
  .side img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    image-rendering: pixelated;
    opacity: 0.9;
  }
  .side .quote {
    position: relative;
    font: var(--txt-heading-xl);
    color: var(--color-text-primary);
    background: var(--color-surface-canvas);
    padding: 1.25rem 1.5rem;
    border-radius: var(--border-radius-md);
    max-width: 26rem;
  }
  .main {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
  }
  .panel {
    width: 100%;
    max-width: 26rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  h1 {
    font: var(--txt-heading-xxl);
    margin: 0;
  }
  h2 {
    font: var(--txt-heading-xl);
    margin: 0;
  }
  p {
    margin: 0;
    font: var(--txt-body-l-regular);
    color: var(--color-text-secondary);
  }
  .points {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .point {
    display: flex;
    gap: 0.75rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .point strong {
    display: block;
    color: var(--color-text-primary);
    font: var(--txt-body-m-semibold);
  }
  .point .icon {
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .preview {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 1rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
  }
  .preview .avatar {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    overflow: hidden;
    background: var(--color-surface-subtle);
    flex-shrink: 0;
  }
  .preview .alias {
    font: var(--txt-heading-s);
  }
  .preview .did {
    font: var(--txt-code-small);
    color: var(--color-text-tertiary);
    word-break: break-all;
  }
  .words {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.375rem;
    counter-reset: word;
  }
  .word {
    font: var(--txt-code-regular);
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0.375rem 0.5rem;
  }
  .word::before {
    counter-increment: word;
    content: counter(word) ".";
    color: var(--color-text-quaternary);
    margin-right: 0.375rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    transition: color 0.2s;
  }
  .check.done {
    color: var(--color-text-primary);
  }
  .check .mark {
    width: 1.25rem;
    height: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid var(--color-border-mid);
  }
  .check.done .mark {
    background: var(--color-feedback-success-fill);
    border-color: var(--color-feedback-success-fill);
    color: white;
  }
  .steps {
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
  }
  .note {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  label.confirm {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font: var(--txt-body-m-regular);
  }
  @media (max-width: 860px) {
    .screen {
      grid-template-columns: 1fr;
    }
    .side {
      display: none;
    }
  }
</style>

<div class="screen">
  <div class="side">
    <img src="/flower.png" alt="" />
    <div class="quote">Your code, your node, your people. No platform in between.</div>
  </div>
  <div class="main">
    <div class="panel">
      {#if step === "intro"}
        <h1>Radicle, in your browser</h1>
        <p>
          Collaborate on code without a platform. Radicle runs a full peer-to-peer
          node right here in this tab.
        </p>
        <div class="points">
          <div class="point">
            <span class="icon"><Icon name="key" /></span>
            <div>
              <strong>An identity you own</strong>
              A cryptographic key made on this device. No account, no email, no password
              stored anywhere else.
            </div>
          </div>
          <div class="point">
            <span class="icon"><Icon name="seed" /></span>
            <div>
              <strong>A node in this tab</strong>
              While Radicle is open, your browser stores repositories and syncs them with
              peers directly.
            </div>
          </div>
          <div class="point">
            <span class="icon"><Icon name="badge" /></span>
            <div>
              <strong>People and orgs, not accounts</strong>
              Profiles and organizations are repositories too, signed by their members.
            </div>
          </div>
        </div>
        <div class="actions">
          <Button variant="secondary" styleHeight="2.5rem" onclick={toName}>
            Create your identity
          </Button>
          <Button variant="naked" styleHeight="2.5rem" onclick={() => (step = "link")}>
            I already use Radicle
          </Button>
        </div>
      {:else if step === "link"}
        <span class="steps">Link a device</span>
        <h2>Add this browser to your identity</h2>
        <p>
          Your identity can live on several devices. Ask one you already use to
          enroll this browser.
        </p>
        <div class="stack">
          <div class="field">
            <span class="label">On a computer with the Radicle CLI, run</span>
            <pre class="word mono" style="white-space: pre-wrap;">rad actor join --code 4KQ-29T-PLX</pre>
            <span class="hint">
              Or open Radicle on that device and approve the request when it appears
              under Keys &amp; devices.
            </span>
          </div>
          <div class="check"><span class="mark"></span>Waiting for approval…</div>
        </div>
        <div class="actions">
          <Button variant="ghost" onclick={() => (step = "intro")}>Back</Button>
          <Button variant="naked" onclick={toName}>Create a new identity instead</Button>
        </div>
      {:else if step === "name"}
        <span class="steps">Step 1 of 3</span>
        <h2>Pick a name people will see</h2>
        <div class="field">
          <label for="alias">Alias</label>
          <input
            id="alias"
            class="input"
            bind:value={alias}
            placeholder="e.g. robin"
            autocomplete="off"
            oninput={() => (alias = alias.toLowerCase())} />
          <span class="hint">
            Lowercase letters, numbers, dashes. Aliases aren't unique on the
            network, your key is.
          </span>
        </div>
        <div class="field">
          <label for="name">Display name <span class="muted">(optional)</span></label>
          <input id="name" class="input" bind:value={name} placeholder="Robin Sato" />
        </div>
        <div class="preview">
          <span class="avatar">
            {#if nid}<UserAvatar nodeId={nid} styleWidth="3rem" />{/if}
          </span>
          <div class="stack" style="gap: 0.125rem; min-width: 0;">
            <span class="alias">{alias || "your-alias"}</span>
            <span class="did">{nid ? `did:key:${nid}` : "Generating key…"}</span>
          </div>
        </div>
        <div class="actions">
          <Button
            variant="secondary"
            styleHeight="2.5rem"
            disabled={!aliasValid || !nid}
            onclick={toRecovery}>
            Continue
          </Button>
          <Button variant="naked" onclick={() => (step = "intro")}>Back</Button>
        </div>
      {:else if step === "recovery"}
        <span class="steps">Step 2 of 3</span>
        <h2>Save your recovery key</h2>
        <p>
          Your key lives in this browser. If you clear site data or lose this
          device, these words are the only way back in.
        </p>
        <div class="words">
          {#each words as word, i (i)}<span class="word">{word}</span>{/each}
        </div>
        <div class="actions">
          <Button variant="ghost" onclick={download}>
            <Icon name="download" /> Download
          </Button>
          <Button
            variant="ghost"
            onclick={() => {
              void navigator.clipboard?.writeText(words.join(" "));
              saved = true;
            }}>
            <Icon name="copy" /> Copy
          </Button>
        </div>
        <label class="confirm">
          <input type="checkbox" bind:checked={saved} />
          I've stored my recovery key somewhere safe
        </label>
        <div class="actions">
          <Button variant="secondary" styleHeight="2.5rem" disabled={!saved} onclick={boot}>
            Start my node
          </Button>
          <Button variant="naked" onclick={boot}>Skip for now</Button>
        </div>
        <span class="note">
          You can also add another device later, so this browser isn't your only key.
        </span>
      {:else}
        <span class="steps">Step 3 of 3</span>
        <h2>{allDone ? "Your node is running" : "Starting your node…"}</h2>
        <p>
          It runs as long as Radicle is open in a tab. When you close it, your peers
          and seed nodes keep your work available.
        </p>
        <div class="stack" style="gap: 0.75rem;">
          {#each checklist as item (item.label)}
            <div class="check" class:done={item.done}>
              <span class="mark">{#if item.done}<Icon name="checkmark" />{/if}</span>
              {item.label}
            </div>
          {/each}
        </div>
        <div class="actions">
          <Button
            variant="secondary"
            styleHeight="2.5rem"
            disabled={!allDone}
            onclick={() => navigate("/", { replace: true })}>
            Open Radicle
          </Button>
        </div>
      {/if}
    </div>
  </div>
</div>
