<script lang="ts">
  import { describeDevice, recoveryPhrase } from "@app/node/identity";
  import { navigate } from "@app/lib/router.svelte";
  import { copy, shortDate, shortNid } from "@app/lib/utils";
  import { nidFor } from "@app/node/hash";
  import { node } from "@app/node/node.svelte";
  import { toast } from "@app/lib/toast.svelte";
  import { hasDismissedHints, restoreHints } from "@app/lib/hints.svelte";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Hint from "@app/components/Hint.svelte";

  interface Props {
    section: string;
  }

  const { section }: Props = $props();

  const self = $derived(node.person("self"));

  // Profile
  let name = $state(node.person("self").name);
  let bio = $state(node.person("self").bio);
  let pronouns = $state(node.person("self").pronouns ?? "");
  let location = $state(node.person("self").location ?? "");
  let website = $state(node.person("self").website ?? "");

  function saveProfile() {
    node.do({
      type: "profile",
      name: name.trim(),
      bio: bio.trim(),
      pronouns: pronouns.trim() || undefined,
      location: location.trim() || undefined,
      website: website.trim() || undefined,
    });
    toast("Profile signed and announced to your peers", { icon: "checkmark" });
  }

  // Keys & devices
  type Device = { name: string; nid: string; added: number; current?: boolean };
  let devices = $state<Device[]>([]);
  $effect(() => {
    if (devices.length === 0 && node.identity) {
      devices = [
        {
          name: node.identity.device,
          nid: node.identity.nid,
          added: node.identity.createdAt,
          current: true,
        },
      ];
    }
  });
  let enrolling = $state<"idle" | "code" | "waiting" | "confirm">("idle");
  let code = $state("");
  const pendingDevice = { name: "MacBook Pro · rad CLI", nid: nidFor("pending-device") };

  function approveDevice() {
    devices = [...devices, { ...pendingDevice, added: Date.now() }];
    enrolling = "idle";
    code = "";
    node.updateIdentity({ recoverySaved: true });
    toast(`${pendingDevice.name} added to your identity`, { icon: "device" });
  }

  let words = $state<string[] | undefined>(undefined);

  // Appearance
  let theme = $state(document.documentElement.getAttribute("data-theme") ?? "light");
  function setTheme(t: string) {
    theme = t;
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("theme", t);
    } catch {
      // Ignored: the theme still applies for this session.
    }
  }

  const sections = [
    { id: "profile", label: "Profile", icon: "avatar-incognito" as const },
    { id: "keys", label: "Keys & devices", icon: "key" as const },
    { id: "appearance", label: "Appearance", icon: "sun" as const },
    { id: "advanced", label: "Advanced", icon: "settings" as const },
  ];
</script>

<style>
  .layout {
    display: grid;
    grid-template-columns: 13rem minmax(0, 1fr);
    gap: 3rem;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  nav a {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4375rem 0.625rem;
    border-radius: var(--border-radius-sm);
    text-decoration: none;
    color: var(--color-text-secondary);
    font: var(--txt-body-m-medium);
  }
  nav a:hover,
  nav a.active {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  h1 {
    font: var(--txt-heading-xl);
    margin: 0 0 0.5rem;
  }
  .lede {
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
    margin: 0 0 2rem;
    max-width: 38rem;
  }
  .form {
    max-width: 36rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .preview {
    display: flex;
    gap: 0.875rem;
    align-items: center;
    padding: 1rem;
    margin-bottom: 1.5rem;
    max-width: 36rem;
  }
  .preview .n {
    font: var(--txt-heading-s);
  }
  .preview .b {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  section {
    margin-bottom: 2.5rem;
    max-width: 40rem;
  }
  .device {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-regular);
  }
  .device:last-child {
    border-bottom: none;
  }
  .device .sub {
    font: var(--txt-code-small);
    color: var(--color-text-tertiary);
  }
  .tag {
    font: var(--txt-body-s-semibold);
    color: var(--color-feedback-success-text);
  }
  .panel {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .panel strong {
    color: var(--color-text-primary);
  }
  .cmd {
    font: var(--txt-code-regular);
    background: var(--color-surface-subtle);
    padding: 0.5rem 0.75rem;
    border-radius: var(--border-radius-sm);
    color: var(--color-text-primary);
  }
  .words {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.375rem;
  }
  .words span {
    font: var(--txt-code-regular);
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0.375rem 0.5rem;
  }
  .warn {
    border-color: var(--color-feedback-warning-border);
  }
  .themes {
    display: flex;
    gap: 0.75rem;
  }
  .theme {
    all: unset;
    cursor: pointer;
    width: 8rem;
    border: 2px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    overflow: hidden;
    font: var(--txt-body-m-medium);
    text-align: center;
  }
  .theme.on {
    border-color: var(--color-border-brand);
  }
  .swatch {
    height: 4rem;
  }
  .theme span {
    display: block;
    padding: 0.5rem;
  }
  @media (max-width: 860px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="page">
  <div class="layout">
    <nav>
      {#each sections as s (s.id)}
        <a href={`/settings?section=${s.id}`} class:active={section === s.id}>
          <Icon name={s.icon} />{s.label}
        </a>
      {/each}
    </nav>
    <div>
      {#if section === "keys"}
        <h1>Keys &amp; devices</h1>
        <p class="lede">
          Your identity is shared by the devices below. Each holds its own key, and any
          one of them can sign as you. With a second device, if you lose one you can
          still sign, and remove the lost one from the other.
        </p>

        {#if node.identity && !node.identity.recoverySaved && devices.length === 1}
          <section>
            <Hint id="keys-only-key">
              <div class="card panel warn">
                <strong>This browser is your only key</strong>
                If its site data is cleared, your identity is gone. Add a device or save
                a recovery key.
              </div>
            </Hint>
          </section>
        {/if}

        <section>
          <h2 class="section-title">Devices</h2>
          <div class="card">
            {#each devices as d (d.nid)}
              <div class="device">
                <Icon name="device" />
                <div class="stack" style="gap: 0.125rem; flex: 1; min-width: 0;">
                  <span>{d.name}</span>
                  <span class="sub">{shortNid(d.nid)} · added {shortDate(d.added)}</span>
                </div>
                {#if d.current}<span class="tag">This browser</span>{/if}
              </div>
            {/each}
          </div>
        </section>

        <section>
          <h2 class="section-title">Add a device</h2>
          {#if enrolling === "idle"}
            <div class="card panel">
              Use Radicle on another browser, or the CLI on a computer, and link it to
              this identity.
              <div class="row">
                <Button variant="secondary" onclick={() => (enrolling = "code")}>
                  <Icon name="plus" /> Add a device
                </Button>
              </div>
            </div>
          {:else if enrolling === "code"}
            <div class="card panel">
              <strong>On the new device, run</strong>
              <span class="cmd">rad actor join {self.did.slice(0, 22)}…</span>
              or open Radicle in that browser and choose “I already use Radicle”. It will
              show a pairing code. Enter it here:
              <input class="input mono" bind:value={code} placeholder="4KQ-29T-PLX" style="max-width: 12rem;" />
              <div class="row">
                <Button variant="naked" onclick={() => (enrolling = "idle")}>Cancel</Button>
                <Button
                  variant="secondary"
                  disabled={code.replace(/[^A-Za-z0-9]/g, "").length < 6}
                  onclick={() => {
                    enrolling = "waiting";
                    setTimeout(() => (enrolling = "confirm"), 1400);
                  }}>
                  Continue
                </Button>
              </div>
            </div>
          {:else if enrolling === "waiting"}
            <div class="card panel">Looking for the device on the network…</div>
          {:else}
            <div class="card panel">
              <strong>Add “{pendingDevice.name}” to your identity?</strong>
              <span>
                Key <span class="mono">{shortNid(pendingDevice.nid)}</span>. Once approved, it
                can sign issues, patches and reviews as {self.alias}.
              </span>
              <div class="row">
                <Button variant="naked" onclick={() => (enrolling = "idle")}>Deny</Button>
                <Button variant="secondary" onclick={approveDevice}>Approve &amp; sign</Button>
              </div>
            </div>
          {/if}
        </section>

        <section>
          <h2 class="section-title">Recovery key</h2>
          <div class="card panel">
            {#if words}
              <div class="words">{#each words as w, i (i)}<span>{w}</span>{/each}</div>
              <div class="row">
                <Button variant="ghost" onclick={() => words && copy(words.join(" "), "recovery key")}><Icon name="copy" /> Copy</Button>
                <Button
                  variant="secondary"
                  onclick={() => {
                    node.updateIdentity({ recoverySaved: true });
                    words = undefined;
                  }}>
                  I've saved it
                </Button>
              </div>
            {:else}
              <span>
                {node.identity?.recoverySaved
                  ? "You've saved a recovery key. Generating a new one replaces it."
                  : "You haven't saved a recovery key yet."}
              </span>
              <div>
                <Button variant="ghost" onclick={() => (words = recoveryPhrase())}>
                  <Icon name="key" /> {node.identity?.recoverySaved ? "Generate a new recovery key" : "Create recovery key"}
                </Button>
              </div>
            {/if}
          </div>
        </section>
      {:else if section === "appearance"}
        <h1>Appearance</h1>
        <p class="lede">How Radicle looks in this browser.</p>
        <div class="themes">
          <button class="theme" class:on={theme === "light"} onclick={() => setTheme("light")}>
            <div class="swatch" style="background: #f6f6f6;"></div>
            <span>Light</span>
          </button>
          <button class="theme" class:on={theme === "dark"} onclick={() => setTheme("dark")}>
            <div class="swatch" style="background: #1a1a1a;"></div>
            <span>Dark</span>
          </button>
        </div>
      {:else if section === "advanced"}
        <h1>Advanced</h1>
        <p class="lede">For trying the prototype from scratch.</p>
        <section>
          <div class="card panel">
            <strong>Start over</strong>
            Forget this identity and everything you did in the prototype, and go back to
            onboarding.
            <div>
              <Button
                variant="ghost"
                onclick={() => {
                  node.reset();
                  navigate("/welcome", { replace: true });
                }}>
                <Icon name="trash" /> Reset prototype
              </Button>
            </div>
          </div>
        </section>
        <section>
          <div class="card panel">
            <strong>Hints</strong>
            Bring back the explanations you've dismissed around the app.
            <div>
              <Button
                variant="ghost"
                disabled={!hasDismissedHints()}
                onclick={() => {
                  restoreHints();
                  toast("Hints restored", { icon: "lightbulb" });
                }}>
                <Icon name="lightbulb" /> Show hints again
              </Button>
            </div>
          </div>
        </section>
        <section>
          <div class="card panel">
            <strong>This device</strong>
            {describeDevice()}
          </div>
        </section>
      {:else}
        <h1>Profile</h1>
        <p class="lede">
          Your profile is a repository signed by your keys. Changes sync to everyone who
          follows you.
        </p>
        <div class="card preview">
          <Avatar person="self" size="3rem" />
          <div>
            <div class="n">{name || self.alias} <span class="muted txt-body-m-regular">{self.alias}{pronouns ? ` · ${pronouns}` : ""}</span></div>
            <div class="b">{bio || "No bio yet"}</div>
          </div>
        </div>
        <div class="form">
          <div class="two">
            <div class="field">
              <label for="p-name">Name</label>
              <input id="p-name" class="input" bind:value={name} />
            </div>
            <div class="field">
              <label for="p-pronouns">Pronouns</label>
              <input id="p-pronouns" class="input" bind:value={pronouns} placeholder="e.g. they/them" />
            </div>
          </div>
          <div class="field">
            <label for="p-bio">Bio</label>
            <textarea id="p-bio" class="textarea" style="min-height: 4.5rem;" bind:value={bio}></textarea>
          </div>
          <div class="two">
            <div class="field">
              <label for="p-loc">Location</label>
              <input id="p-loc" class="input" bind:value={location} />
            </div>
            <div class="field">
              <label for="p-web">Website</label>
              <input id="p-web" class="input" bind:value={website} placeholder="https://" />
            </div>
          </div>
          <div class="row">
            <Button variant="secondary" onclick={saveProfile}>Save &amp; publish</Button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
