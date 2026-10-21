<script lang="ts">
  import { onMount } from "svelte";

  import Icon from "@app/components/Icon.svelte";

  export let id: string;

  const didPrefix = "z6Mkha";
  const didSuffix = "ta2doK";
  const didReal = `${didPrefix}…${didSuffix}`;
  const scrambleChars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789";

  let didValue = didReal;
  let generating = false;

  function randomChar(): string {
    return scrambleChars.charAt(
      Math.floor(Math.random() * scrambleChars.length),
    );
  }

  onMount(() => {
    if (id !== "identity") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const chars = didReal.split("");
    const scrambleTicks = 22;
    const cycle = scrambleTicks + 55;
    let tick = 0;

    const interval = setInterval(() => {
      tick = (tick + 1) % cycle;
      if (tick < scrambleTicks) {
        generating = true;
        const locked = Math.floor((tick / scrambleTicks) * chars.length);
        didValue = chars
          .map((ch, i) => (ch === "…" || i < locked ? ch : randomChar()))
          .join("");
      } else {
        generating = false;
        didValue = didReal;
      }
    }, 55);

    return () => clearInterval(interval);
  });
</script>

<style>
  .figure {
    --node-neutral: var(--color-text-secondary);
    --node-blue: var(--color-accent-blue-500);
    --node-green: var(--color-accent-green-600);
    --node-purple: var(--color-accent-purple-500);
    --node-amber: var(--color-semantic-amber-500);
    --mesh-line: var(--color-border-strong);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.25rem;
    width: 100%;
  }

  .mono {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.8125rem;
    line-height: 1.6;
  }

  .diagram {
    width: 100%;
    max-width: 22rem;
    height: auto;
  }

  /* Network diagram elements — theme-aware via design tokens. */
  .mesh-line {
    stroke: var(--mesh-line);
    stroke-width: 1.5;
  }

  .hub-dot circle {
    fill: var(--node-neutral);
  }

  /* Packets flowing along each spoke into the central forge, reinforcing
     that everything routes through one server. */
  .packet {
    fill: var(--color-text-tertiary);
    animation: forge-flow 8s ease-in-out infinite;
  }

  /* Colored packets exchanged directly between peers along the mesh edges. */
  .mesh-packet {
    fill: var(--c);
  }

  @keyframes forge-flow {
    0%,
    100% {
      transform: translate(var(--dx), var(--dy));
      opacity: 0;
    }
    10% {
      transform: translate(var(--dx), var(--dy));
      opacity: 0.35;
    }
    30% {
      transform: translate(0, 0);
      opacity: 1;
    }
    50% {
      transform: translate(var(--dx), var(--dy));
      opacity: 0.35;
    }
    58% {
      transform: translate(var(--dx), var(--dy));
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .packet {
      animation: none;
      opacity: 0;
    }
    .id-key::before,
    .id-key::after {
      animation: none;
      opacity: 0;
    }
    .did-key::after {
      animation: none;
    }
    .gossip-ripple {
      animation: none;
      opacity: 0;
    }
    .ref-row {
      animation: none;
      background-color: transparent;
    }
    .signed-check path {
      animation: none;
      stroke-dashoffset: 0;
    }
    .repo-row {
      animation: none;
      background-color: var(--color-surface-mid);
    }
    .repo-row .dot {
      animation: none;
      transform: none;
    }
  }

  .hub-chip {
    fill: var(--color-surface-subtle);
    stroke: var(--color-border-mid);
    stroke-width: 1.5;
  }

  .hub-title {
    fill: var(--color-text-primary);
    font:
      600 15px Booton,
      sans-serif;
  }

  .hub-sub {
    fill: var(--color-text-tertiary);
    font:
      400 12px "JetBrains Mono",
      monospace;
  }

  .nd-blue {
    fill: var(--node-blue);
  }
  .nd-green {
    fill: var(--node-green);
  }
  .nd-purple {
    fill: var(--node-purple);
  }
  .nd-neutral {
    fill: var(--node-neutral);
  }

  /* Gossip announcements rippling out from the node to its peers. */
  .gossip-ripple {
    fill: none;
    stroke: var(--node-blue);
    stroke-width: 1.5;
    animation: gossip-out 3s ease-out infinite;
  }

  @keyframes gossip-out {
    0% {
      r: 14px;
      opacity: 0.5;
    }
    100% {
      r: 92px;
      opacity: 0;
    }
  }

  /* Identity */
  .id-key {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 5rem;
    height: 5rem;
    border-radius: var(--border-radius-round);
    background: var(--node-blue);
    color: var(--color-neutrals-opaque-light-0);
  }
  .id-key :global(svg) {
    width: 2.5rem;
    height: 2.5rem;
  }

  /* Signal rings ping out from the key while it is generating, in sync with
     the key string being computed below. */
  .id-key::before,
  .id-key::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 1.5px solid var(--node-blue);
    opacity: 0;
  }
  .id-key.generating::before,
  .id-key.generating::after {
    animation: id-ping 0.9s ease-out;
  }
  .id-key.generating::after {
    animation-delay: 0.3s;
  }

  @keyframes id-ping {
    0% {
      transform: scale(1);
      opacity: 0.45;
    }
    80%,
    100% {
      transform: scale(2.1);
      opacity: 0;
    }
  }

  .did-key {
    position: relative;
    max-width: 100%;
    padding: 0.6rem 1rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-small);
    background: var(--color-surface-subtle);
    overflow: hidden;
    white-space: nowrap;
  }

  /* Light sweep across the key string. A dark glint reads against the light
     surface; dark theme brightens instead. */
  .did-key {
    --shimmer-color: rgba(0, 0, 0, 0.08);
  }
  :global(:root[data-theme="dark"]) .did-key {
    --shimmer-color: rgba(255, 255, 255, 0.35);
  }
  .did-key::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      100deg,
      transparent 35%,
      var(--shimmer-color) 50%,
      transparent 65%
    );
    transform: translateX(-120%);
    animation: did-shimmer 4.5s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes did-shimmer {
    0%,
    20% {
      transform: translateX(-120%);
    }
    70%,
    100% {
      transform: translateX(120%);
    }
  }
  .did-prefix {
    color: var(--color-text-tertiary);
  }
  .did-value {
    color: var(--color-code-strings);
  }

  .dot {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: var(--border-radius-round);
  }
  .dot-green {
    background: var(--node-green);
  }
  .dot-amber {
    background: var(--node-amber);
  }
  .dot-purple {
    background: var(--node-purple);
  }

  /* Trust */
  .trust-figure {
    position: relative;
    width: 100%;
    max-width: 26rem;
  }
  .ref-card {
    text-align: left;
    padding: 1.25rem 1.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-regular);
    background: var(--color-surface-subtle);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .ref-head {
    color: var(--color-code-keywords);
    font-weight: 600;
  }
  .ref-row {
    display: flex;
    gap: 0.75rem;
    overflow: hidden;
    border-radius: var(--border-radius-small);
    animation: ref-verify 4.5s ease-in-out infinite;
  }
  .ref-card .ref-row:nth-child(2) {
    animation-delay: 0s;
  }
  .ref-card .ref-row:nth-child(3) {
    animation-delay: 0.35s;
  }
  .ref-card .ref-row:nth-child(4) {
    animation-delay: 0.7s;
  }

  /* Each signed ref highlights in turn, then the Signed check draws itself. */
  @keyframes ref-verify {
    0%,
    100% {
      background-color: transparent;
    }
    4% {
      background-color: color-mix(in srgb, var(--node-green) 18%, transparent);
    }
    16% {
      background-color: transparent;
    }
  }
  .ref-row .hash {
    color: var(--color-code-strings);
    flex: none;
  }
  .ref-row .ref-path {
    color: var(--color-text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .signed-badge {
    position: absolute;
    right: -0.25rem;
    bottom: -1.25rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.35rem 0.35rem 0.9rem;
    border-radius: var(--border-radius-round);
    background: var(--color-surface-canvas);
  }
  .signed-check {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--node-green);
    color: var(--color-neutrals-opaque-light-0);
  }
  .signed-check path {
    stroke-dasharray: 24;
    stroke-dashoffset: 0;
    animation: check-draw 4.5s ease-in-out infinite;
  }
  @keyframes check-draw {
    0%,
    42% {
      stroke-dashoffset: -24;
    }
    58%,
    92% {
      stroke-dashoffset: 0;
    }
    100% {
      stroke-dashoffset: -24;
    }
  }

  /* Collaboration */
  .repo-card {
    width: 100%;
    max-width: 26rem;
    text-align: left;
    padding: 1.25rem 1.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-regular);
    background: var(--color-surface-subtle);
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .repo-head {
    color: var(--color-code-keywords);
    font-weight: 600;
  }
  .repo-rows {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .repo-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem 0.9rem;
    border-radius: var(--border-radius-small);
    background: var(--color-surface-mid);
    font: var(--txt-medium-16);
    animation: cob-row 3s ease-in-out infinite;
  }
  .repo-rows .repo-row:nth-child(1) {
    --row-accent: var(--node-green);
  }
  .repo-rows .repo-row:nth-child(2) {
    --row-accent: var(--node-amber);
    animation-delay: 0.3s;
  }
  .repo-rows .repo-row:nth-child(3) {
    --row-accent: var(--node-purple);
    animation-delay: 0.6s;
  }

  /* Each object-type row lights up in sequence, its dot pulsing and the row
     briefly highlighting, a heartbeat of activity across the repo. */
  .repo-row .dot {
    animation: cob-pulse 3s ease-in-out infinite;
  }
  .repo-rows .repo-row:nth-child(2) .dot {
    animation-delay: 0.3s;
  }
  .repo-rows .repo-row:nth-child(3) .dot {
    animation-delay: 0.6s;
  }
  @keyframes cob-pulse {
    0%,
    22%,
    100% {
      transform: scale(1);
    }
    8% {
      transform: scale(1.5);
    }
  }
  @keyframes cob-row {
    0%,
    26%,
    100% {
      background-color: var(--color-surface-mid);
    }
    8% {
      background-color: color-mix(
        in srgb,
        var(--row-accent) 16%,
        var(--color-surface-mid)
      );
    }
  }
  .repo-row strong {
    color: var(--color-text-primary);
    font-weight: 600;
  }
  .repo-meta {
    margin-left: auto;
    color: var(--color-text-tertiary);
  }
</style>

<div class="figure">
  {#if id === "status-quo"}
    <svg class="diagram" viewBox="0 0 360 300" fill="none" aria-hidden="true">
      <g class="mesh-line">
        <line x1="180" y1="150" x2="180" y2="36" />
        <line x1="180" y1="150" x2="300" y2="92" />
        <line x1="180" y1="150" x2="60" y2="92" />
        <line x1="180" y1="150" x2="300" y2="210" />
        <line x1="180" y1="150" x2="60" y2="210" />
        <line x1="180" y1="150" x2="180" y2="266" />
      </g>
      <g class="forge-packets">
        <circle
          class="packet"
          cx="180"
          cy="150"
          r="3"
          style="--dx: 0px; --dy: -114px; animation-delay: 0s;" />
        <circle
          class="packet"
          cx="180"
          cy="150"
          r="3"
          style="--dx: 120px; --dy: -58px; animation-delay: -1.3s;" />
        <circle
          class="packet"
          cx="180"
          cy="150"
          r="3"
          style="--dx: -120px; --dy: -58px; animation-delay: -2.7s;" />
        <circle
          class="packet"
          cx="180"
          cy="150"
          r="3"
          style="--dx: 120px; --dy: 60px; animation-delay: -5.3s;" />
        <circle
          class="packet"
          cx="180"
          cy="150"
          r="3"
          style="--dx: -120px; --dy: 60px; animation-delay: -4s;" />
        <circle
          class="packet"
          cx="180"
          cy="150"
          r="3"
          style="--dx: 0px; --dy: 116px; animation-delay: -6.7s;" />
      </g>
      <g class="hub-dot">
        <circle cx="180" cy="36" r="9" />
        <circle cx="300" cy="92" r="9" />
        <circle cx="60" cy="92" r="9" />
        <circle cx="300" cy="210" r="9" />
        <circle cx="60" cy="210" r="9" />
        <circle cx="180" cy="266" r="9" />
      </g>
      <rect class="hub-chip" x="116" y="124" width="128" height="52" rx="10" />
      <text class="hub-title" x="180" y="147" text-anchor="middle">
        Central forge
      </text>
      <text class="hub-sub" x="180" y="166" text-anchor="middle">
        GitHub · GitLab
      </text>
    </svg>
  {:else if id === "nodes"}
    <svg class="diagram" viewBox="0 0 360 340" fill="none" aria-hidden="true">
      <g class="mesh-line">
        <line x1="180" y1="55" x2="274" y2="100" />
        <line x1="274" y1="100" x2="297" y2="202" />
        <line x1="297" y1="202" x2="232" y2="283" />
        <line x1="232" y1="283" x2="128" y2="283" />
        <line x1="128" y1="283" x2="63" y2="202" />
        <line x1="63" y1="202" x2="86" y2="100" />
        <line x1="86" y1="100" x2="180" y2="55" />
        <line x1="180" y1="55" x2="232" y2="283" />
        <line x1="274" y1="100" x2="128" y2="283" />
        <line x1="297" y1="202" x2="63" y2="202" />
        <line x1="180" y1="55" x2="297" y2="202" />
        <line x1="232" y1="283" x2="63" y2="202" />
        <line x1="128" y1="283" x2="86" y2="100" />
      </g>
      <g class="mesh-packets">
        <circle
          class="packet mesh-packet"
          cx="180"
          cy="55"
          r="3"
          style="--dx: 94px; --dy: 45px; --c: var(--color-accent-purple-500); animation-delay: 0s;" />
        <circle
          class="packet mesh-packet"
          cx="274"
          cy="100"
          r="3"
          style="--dx: 23px; --dy: 102px; --c: var(--color-accent-cyan-500); animation-delay: -0.6s;" />
        <circle
          class="packet mesh-packet"
          cx="297"
          cy="202"
          r="3"
          style="--dx: -65px; --dy: 81px; --c: var(--color-accent-citrus-500); animation-delay: -1.2s;" />
        <circle
          class="packet mesh-packet"
          cx="232"
          cy="283"
          r="3"
          style="--dx: -104px; --dy: 0px; --c: var(--color-accent-pink-500); animation-delay: -1.8s;" />
        <circle
          class="packet mesh-packet"
          cx="128"
          cy="283"
          r="3"
          style="--dx: -65px; --dy: -81px; --c: var(--color-accent-emerald-500); animation-delay: -2.5s;" />
        <circle
          class="packet mesh-packet"
          cx="63"
          cy="202"
          r="3"
          style="--dx: 23px; --dy: -102px; --c: var(--color-accent-olive-500); animation-delay: -3.1s;" />
        <circle
          class="packet mesh-packet"
          cx="86"
          cy="100"
          r="3"
          style="--dx: 94px; --dy: -45px; --c: var(--color-accent-purple-500); animation-delay: -3.7s;" />
        <circle
          class="packet mesh-packet"
          cx="180"
          cy="55"
          r="3"
          style="--dx: 52px; --dy: 228px; --c: var(--color-accent-cyan-500); animation-delay: -4.3s;" />
        <circle
          class="packet mesh-packet"
          cx="274"
          cy="100"
          r="3"
          style="--dx: -146px; --dy: 183px; --c: var(--color-accent-citrus-500); animation-delay: -4.9s;" />
        <circle
          class="packet mesh-packet"
          cx="297"
          cy="202"
          r="3"
          style="--dx: -234px; --dy: 0px; --c: var(--color-accent-pink-500); animation-delay: -5.5s;" />
        <circle
          class="packet mesh-packet"
          cx="180"
          cy="55"
          r="3"
          style="--dx: 117px; --dy: 147px; --c: var(--color-accent-emerald-500); animation-delay: -6.2s;" />
        <circle
          class="packet mesh-packet"
          cx="232"
          cy="283"
          r="3"
          style="--dx: -169px; --dy: -81px; --c: var(--color-accent-olive-500); animation-delay: -6.8s;" />
        <circle
          class="packet mesh-packet"
          cx="128"
          cy="283"
          r="3"
          style="--dx: -42px; --dy: -183px; --c: var(--color-accent-purple-500); animation-delay: -7.4s;" />
      </g>
      <rect
        class="nd-blue"
        x="160"
        y="35"
        width="40"
        height="40"
        rx="12"
        fill-opacity="0.13" />
      <rect
        class="nd-green"
        x="254"
        y="80"
        width="40"
        height="40"
        rx="12"
        fill-opacity="0.13" />
      <rect
        class="nd-purple"
        x="277"
        y="182"
        width="40"
        height="40"
        rx="12"
        fill-opacity="0.13" />
      <rect
        class="nd-blue"
        x="212"
        y="263"
        width="40"
        height="40"
        rx="12"
        fill-opacity="0.13" />
      <rect
        class="nd-green"
        x="108"
        y="263"
        width="40"
        height="40"
        rx="12"
        fill-opacity="0.13" />
      <rect
        class="nd-purple"
        x="43"
        y="182"
        width="40"
        height="40"
        rx="12"
        fill-opacity="0.13" />
      <rect
        class="nd-blue"
        x="66"
        y="80"
        width="40"
        height="40"
        rx="12"
        fill-opacity="0.13" />
      <circle class="nd-blue" cx="180" cy="55" r="9" />
      <circle class="nd-green" cx="274" cy="100" r="9" />
      <circle class="nd-purple" cx="297" cy="202" r="9" />
      <circle class="nd-blue" cx="232" cy="283" r="9" />
      <circle class="nd-green" cx="128" cy="283" r="9" />
      <circle class="nd-purple" cx="63" cy="202" r="9" />
      <circle class="nd-blue" cx="86" cy="100" r="9" />
    </svg>
  {:else if id === "identity"}
    <span class="id-key" class:generating aria-hidden="true">
      <Icon name="key" />
    </span>
    <div class="did-key mono">
      <span class="did-prefix">did:key:</span>
      <span class="did-value">{didValue}</span>
    </div>
  {:else if id === "networking"}
    <svg class="diagram" viewBox="0 0 360 360" fill="none" aria-hidden="true">
      <g class="mesh-line">
        <line x1="239" y1="73" x2="298" y2="175" />
        <line x1="298" y1="175" x2="239" y2="277" />
        <line x1="239" y1="277" x2="121" y2="277" />
        <line x1="121" y1="277" x2="62" y2="175" />
        <line x1="62" y1="175" x2="121" y2="73" />
        <line x1="121" y1="73" x2="239" y2="73" />
        <line x1="239" y1="73" x2="239" y2="277" />
        <line x1="298" y1="175" x2="121" y2="277" />
        <line x1="298" y1="175" x2="121" y2="73" />
        <line x1="239" y1="277" x2="62" y2="175" />
        <line x1="121" y1="277" x2="121" y2="73" />
        <line x1="62" y1="175" x2="239" y2="73" />
      </g>
      <circle
        class="gossip-ripple"
        cx="180"
        cy="175"
        r="14"
        style="animation-delay: 0s;" />
      <circle
        class="gossip-ripple"
        cx="180"
        cy="175"
        r="14"
        style="animation-delay: -1s;" />
      <circle
        class="gossip-ripple"
        cx="180"
        cy="175"
        r="14"
        style="animation-delay: -2s;" />
      <circle class="nd-neutral" cx="239" cy="73" r="10" />
      <circle class="nd-neutral" cx="298" cy="175" r="10" />
      <circle class="nd-neutral" cx="239" cy="277" r="10" />
      <circle class="nd-neutral" cx="121" cy="277" r="10" />
      <circle class="nd-neutral" cx="62" cy="175" r="10" />
      <circle class="nd-neutral" cx="121" cy="73" r="10" />
      <circle class="nd-blue" cx="180" cy="175" r="22" fill-opacity="0.15" />
      <circle class="nd-blue" cx="180" cy="175" r="11" />
    </svg>
  {:else if id === "trust"}
    <div class="trust-figure">
      <div class="ref-card mono">
        <div class="ref-head">refs/rad/sigrefs</div>
        <div class="ref-row">
          <span class="hash">9767b485c2aad1e2</span>
          <span class="ref-path">refs/heads/master</span>
        </div>
        <div class="ref-row">
          <span class="hash">f3eaa7454e3a4714</span>
          <span class="ref-path">refs/cobs/xyz.radicle.patch/…</span>
        </div>
        <div class="ref-row">
          <span class="hash">0590b78ee42b3908</span>
          <span class="ref-path">refs/cobs/xyz.radicle.issue/…</span>
        </div>
      </div>
      <div class="signed-badge">
        <span class="signed-label txt-bold-16">Signed</span>
        <span class="signed-check">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      </div>
    </div>
  {:else if id === "collaboration"}
    <div class="repo-card">
      <div class="repo-head mono">rad:z3gqcJUoA1n9…</div>
      <div class="repo-rows">
        <div class="repo-row">
          <span class="dot dot-green"></span>
          <strong>Code</strong>
          <span class="repo-meta mono">commits &amp; branches</span>
        </div>
        <div class="repo-row">
          <span class="dot dot-amber"></span>
          <strong>Issues</strong>
          <span class="repo-meta mono">xyz.radicle.issue</span>
        </div>
        <div class="repo-row">
          <span class="dot dot-purple"></span>
          <strong>Patches</strong>
          <span class="repo-meta mono">xyz.radicle.patch</span>
        </div>
      </div>
    </div>
  {/if}
</div>
