import type { RepoSeed } from "./types";

// atlas-ui: Fieldwork Studio's Svelte component library and design tokens.
// Delegates are mira and yuki; "self" contributes patches but can't merge.

const README = `# atlas-ui

Svelte components and design tokens for Fieldwork Studio products. Small on
purpose: a handful of accessible primitives, a token set you can theme, and
nothing that needs a build plugin.

## Install

\`\`\`sh
npm install @fieldwork/atlas-ui
\`\`\`

Svelte 5 is a peer dependency.

## Usage

\`\`\`svelte
<script lang="ts">
  import { Button, Tooltip } from "@fieldwork/atlas-ui";
</script>

<Tooltip text="Saves without publishing">
  <Button variant="secondary">Save draft</Button>
</Tooltip>
\`\`\`

## Tokens

Tokens come in two tiers:

- **palette**: raw values (\`ink500\`, \`moss600\`). Never use these in components.
- **color**, **space**: semantic names (\`textMuted\`, \`accent\`, \`space.md\`).

Call \`cssVariables()\` once at app start and inject the result into
\`:root\`, or copy the generated variables into your own stylesheet.

## Components

| Component | Notes |
| --- | --- |
| \`Button\` | \`primary\`, \`secondary\`, \`ghost\`; \`sm\` and \`md\` sizes |
| \`Tooltip\` | Shows on hover and focus |
| \`Dialog\` | Modal, traps focus, closes on Escape |

## Contributing

Read [docs/contributing.md](docs/contributing.md). Patches go through Radicle:
push a branch with \`git push rad HEAD:refs/patches\` and a delegate will pick
it up.

## License

MIT
`;

const PACKAGE_JSON = `{
  "name": "@fieldwork/atlas-ui",
  "version": "1.0.0",
  "description": "Svelte components and design tokens for Fieldwork Studio products",
  "type": "module",
  "license": "MIT",
  "svelte": "./src/components/index.ts",
  "exports": {
    ".": "./src/components/index.ts",
    "./tokens": "./src/tokens/index.ts"
  },
  "scripts": {
    "dev": "vite",
    "build": "svelte-package -i src -o dist",
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/package": "^2.3.0",
    "svelte": "^5.1.0",
    "svelte-check": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["svelte", "vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"]
}
`;

const COLORS = `// Color tokens. Raw palette values live in \`palette\`; components should only
// ever reach for the semantic names in \`color\`.

export const palette = {
  ink900: "#14161a",
  ink700: "#2c3038",
  ink500: "#7a8190",
  ink300: "#a3a9b5",
  ink100: "#e4e7ec",
  paper: "#fbfaf7",
  moss600: "#3f6b4f",
  moss500: "#4f8763",
  clay600: "#a8503a",
  clay500: "#c4624a",
  ochre500: "#c99a2e",
  sky500: "#3b79b8",
} as const;

export const color = {
  textPrimary: palette.ink900,
  textMuted: palette.ink500,
  surface: palette.paper,
  surfaceRaised: "#ffffff",
  border: palette.ink100,
  accent: palette.moss600,
  accentHover: palette.moss500,
  danger: palette.clay600,
  warning: palette.ochre500,
  focusRing: palette.sky500,
} as const;

export type ColorToken = keyof typeof color;

export function cssVariables(): string {
  return Object.entries(color)
    .map(([name, value]) => \`--atlas-\${kebab(name)}: \${value};\`)
    .join("\\n");
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}
`;

const SPACING = `// 4px base grid. Values are in rem so they scale with the user's font size.

export const space = {
  none: "0",
  xxs: "0.125rem",
  xs: "0.25rem",
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.5rem",
  xxl: "2rem",
  xxxl: "3rem",
} as const;

export type SpaceToken = keyof typeof space;
`;

const TOKENS_INDEX = `export { palette, color, cssVariables } from "./colors";
export type { ColorToken } from "./colors";
export { space } from "./spacing";
export type { SpaceToken } from "./spacing";
`;

const BUTTON = `<script lang="ts">
  import type { Snippet } from "svelte";

  type Variant = "primary" | "secondary" | "ghost";
  type Size = "sm" | "md";

  interface Props {
    variant?: Variant;
    size?: Size;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
    loading?: boolean;
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  }

  let {
    variant = "primary",
    size = "md",
    type = "button",
    disabled = false,
    loading = false,
    onclick,
    children,
  }: Props = $props();
</script>

<button
  class="atlas-button {variant} {size}"
  {type}
  disabled={disabled || loading}
  aria-busy={loading}
  {onclick}
>
  {#if loading}
    <span class="spinner" aria-hidden="true"></span>
  {/if}
  {@render children()}
</button>

<style>
  .atlas-button {
    display: inline-flex;
    align-items: center;
    gap: var(--atlas-space-sm);
    border: 1px solid transparent;
    border-radius: 6px;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }
  .md {
    min-height: 2.5rem;
    padding: 0 var(--atlas-space-lg);
  }
  .sm {
    min-height: 2rem;
    padding: 0 var(--atlas-space-md);
  }
  .primary {
    background: var(--atlas-accent);
    color: var(--atlas-surface-raised);
  }
  .primary:hover {
    background: var(--atlas-accent-hover);
  }
  .secondary {
    background: var(--atlas-surface-raised);
    border-color: var(--atlas-border);
    color: var(--atlas-text-primary);
  }
  .ghost {
    background: transparent;
    color: var(--atlas-text-primary);
  }
  .atlas-button:focus-visible {
    outline: 2px solid var(--atlas-focus-ring);
    outline-offset: 2px;
  }
  .atlas-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
`;

const TOOLTIP = `<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    text: string;
    placement?: "top" | "bottom";
    children: Snippet;
  }

  let { text, placement = "top", children }: Props = $props();

  const id = "atlas-tooltip-" + Math.random().toString(36).slice(2, 8);
  let open = $state(false);

  function show() {
    open = true;
  }

  function hide() {
    open = false;
  }
</script>

<span
  class="atlas-tooltip-anchor"
  aria-describedby={open ? id : undefined}
  onmouseenter={show}
  onmouseleave={hide}
  onfocusin={show}
  onfocusout={hide}
>
  {@render children()}
  {#if open}
    <span {id} role="tooltip" class="atlas-tooltip {placement}">{text}</span>
  {/if}
</span>

<style>
  .atlas-tooltip-anchor {
    position: relative;
    display: inline-flex;
  }
  .atlas-tooltip {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    padding: var(--atlas-space-xs) var(--atlas-space-sm);
    border-radius: 4px;
    background: var(--atlas-text-primary);
    color: var(--atlas-surface);
    font-size: 0.8125rem;
    white-space: nowrap;
    pointer-events: none;
  }
  .top {
    bottom: calc(100% + 6px);
  }
  .bottom {
    top: calc(100% + 6px);
  }
</style>
`;

const DIALOG = `<script lang="ts">
  import type { Snippet } from "svelte";
  import { trapFocus } from "../lib/focusTrap";

  interface Props {
    open: boolean;
    title?: string;
    onclose: () => void;
    children: Snippet;
  }

  let { open, title, onclose, children }: Props = $props();

  let panel: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (!open || !panel) return;
    const release = trapFocus(panel);
    return release;
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onclose();
  }
</script>

{#if open}
  <div class="atlas-backdrop" onclick={onclose} aria-hidden="true"></div>
  <div
    bind:this={panel}
    class="atlas-dialog"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    {onkeydown}
  >
    {#if title}
      <h2 class="title">{title}</h2>
    {/if}
    {@render children()}
  </div>
{/if}

<style>
  .atlas-backdrop {
    position: fixed;
    inset: 0;
    background: rgb(20 22 26 / 0.45);
  }
  .atlas-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(32rem, calc(100vw - 2rem));
    max-height: calc(100vh - 4rem);
    overflow: auto;
    padding: var(--atlas-space-xl);
    border-radius: 10px;
    background: var(--atlas-surface-raised);
    box-shadow: 0 12px 40px rgb(20 22 26 / 0.2);
  }
  .title {
    margin: 0 0 var(--atlas-space-md);
    font-size: 1.125rem;
  }
</style>
`;

const COMPONENTS_INDEX = `export { default as Button } from "./Button.svelte";
export { default as Tooltip } from "./Tooltip.svelte";
export { default as Dialog } from "./Dialog.svelte";
export * from "../tokens";
`;

const FOCUS_TRAP = `// Keeps Tab and Shift+Tab inside \`container\` until the returned function is
// called. Focuses the first tabbable element (or the container itself).

const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function tabbables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function trapFocus(container: HTMLElement): () => void {
  const first = tabbables(container)[0] ?? container;
  first.focus();

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== "Tab") return;
    const items = tabbables(container);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const head = items[0];
    const tail = items[items.length - 1];
    if (event.shiftKey && document.activeElement === head) {
      event.preventDefault();
      tail.focus();
    } else if (!event.shiftKey && document.activeElement === tail) {
      event.preventDefault();
      head.focus();
    }
  }

  document.addEventListener("keydown", onKeydown);
  return () => document.removeEventListener("keydown", onKeydown);
}
`;

const CONTRIBUTING = `# Contributing to atlas-ui

Thanks for helping. A few habits keep this library small and predictable.

## Before you start

- Check open issues. If your change is bigger than a bug fix, open one first
  so we can agree on the API before you write it.
- Every component must work with keyboard only, with VoiceOver + Safari and
  with NVDA + Firefox. If you can't test one of those, say so in the patch and
  someone will.

## Local setup

\`\`\`sh
npm install
npm run dev     # playground at localhost:5173
npm run check   # svelte-check + types
npm test
\`\`\`

## Patches

- One concern per patch. Rebase rather than merge when updating a revision.
- Commit messages: short imperative summary, blank line, then the why.
- Add a line under "Unreleased" in CHANGELOG.md for anything user-visible.
- A delegate (currently mira and yuki) merges once one of them approves.

## Tokens

Don't add a new color without a semantic name and a reason. Components never
import \`palette\` directly.
`;

const CHANGELOG = `# Changelog

All notable changes to this project are documented here. The format is loosely
based on Keep a Changelog; versions follow semver.

## Unreleased

## 1.0.0

First public release.

- Button with primary, secondary and ghost variants.
- Tooltip shown on hover and focus.
- Dialog with focus trap and Escape to close.
- Color and spacing tokens with a \`cssVariables()\` helper.
`;

const GITIGNORE = `node_modules/
dist/
.svelte-kit/
coverage/
*.log
.DS_Store
`;

const LICENSE = `MIT License

Copyright (c) 2026 Fieldwork Studio and atlas-ui contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

export const atlasUi: RepoSeed = {
  owner: { org: "fieldwork-studio" },
  name: "atlas-ui",
  description:
    "Accessible Svelte components and themeable design tokens for Fieldwork Studio products.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["mira", "yuki"],
  threshold: 1,
  seeding: 18,
  files: {
    "README.md": README,
    "package.json": PACKAGE_JSON,
    "tsconfig.json": TSCONFIG,
    "src/tokens/colors.ts": COLORS,
    "src/tokens/spacing.ts": SPACING,
    "src/tokens/index.ts": TOKENS_INDEX,
    "src/components/Button.svelte": BUTTON,
    "src/components/Tooltip.svelte": TOOLTIP,
    "src/components/Dialog.svelte": DIALOG,
    "src/components/index.ts": COMPONENTS_INDEX,
    "src/lib/focusTrap.ts": FOCUS_TRAP,
    "docs/contributing.md": CONTRIBUTING,
    "CHANGELOG.md": CHANGELOG,
    ".gitignore": GITIGNORE,
    LICENSE: LICENSE,
  },
  root: {
    label: "root",
    message: `Import atlas-ui 1.0.0

Moves the components and tokens out of the studio monorepo into their own
repository so client projects can depend on them without vendoring. History
before this point lives in the old monorepo; this commit is the 1.0.0 tree
as published.`,
    author: "mira",
    daysAgo: 150,
  },
  history: [
    {
      label: "tooltip-escape",
      message: `Tooltip: keep it in the DOM, add show delay and Escape

The tooltip element was only rendered while open, and aria-describedby
pointed at it at the same moment it was created. VoiceOver reads the
description when focus lands, before Svelte has inserted the node, so the
tooltip was never announced. Render it always and toggle \`hidden\` instead.

Also:
- 300ms show delay so sweeping the pointer across a toolbar doesn't strobe.
- Escape hides the tooltip and stops propagation, so a tooltip inside a
  Dialog no longer closes the whole dialog on the first Escape.`,
      author: "mira",
      daysAgo: 141,
      changes: {
        "src/components/Tooltip.svelte": [
          [
            `  let open = $state(false);

  function show() {
    open = true;
  }

  function hide() {
    open = false;
  }`,
            `  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function show() {
    clearTimeout(timer);
    timer = setTimeout(() => (open = true), 300);
  }

  function hide() {
    clearTimeout(timer);
    open = false;
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      hide();
    }
  }`,
          ],
          [`  aria-describedby={open ? id : undefined}`, `  aria-describedby={id}`],
          [`  onfocusout={hide}\n>`, `  onfocusout={hide}\n  {onkeydown}\n>`],
          [
            `  {#if open}
    <span {id} role="tooltip" class="atlas-tooltip {placement}">{text}</span>
  {/if}`,
            `  <span {id} role="tooltip" class="atlas-tooltip {placement}" hidden={!open}>{text}</span>`,
          ],
        ],
        "README.md": [
          ["| Shows on hover and focus |", "| Shows on hover and focus after 300ms, Escape dismisses |"],
        ],
      },
    },
    {
      label: "radius-tokens",
      message: `tokens: add a radius scale

We had 4px, 6px and 10px hard-coded across three components and a fourth
value (8px) creeping in from the marketing site. Four named steps, no more.
Components will move over to these one at a time so the diffs stay
reviewable.`,
      author: "self",
      daysAgo: 132,
      changes: {
        "src/tokens/radius.ts": `// Corner radii. Keep these few: if a design needs a new one, it probably
// needs a conversation first.

export const radius = {
  sm: "4px",
  md: "6px",
  lg: "10px",
  pill: "999px",
} as const;

export type RadiusToken = keyof typeof radius;
`,
        "src/tokens/index.ts": [
          [
            `export type { SpaceToken } from "./spacing";\n`,
            `export type { SpaceToken } from "./spacing";
export { radius } from "./radius";
export type { RadiusToken } from "./radius";
`,
          ],
        ],
      },
    },
    {
      label: "focus-trap-inert",
      message: `focusTrap: make everything outside the container inert

Trapping Tab isn't enough. VoiceOver's rotor and swipe navigation walk
straight past a keydown listener, and a mouse user could still click a link
behind the backdrop. Set \`inert\` on the body's other children while the
trap is active and restore exactly the ones we changed on release (some
apps set inert themselves; we leave those alone).`,
      author: "yuki",
      daysAgo: 123,
      changes: {
        "src/lib/focusTrap.ts": [
          [
            `  first.focus();\n`,
            `  first.focus();

  // Make everything outside the container unreachable for screen readers and
  // pointer users too, not just Tab. Restored on release.
  const inerted: HTMLElement[] = [];
  for (const sibling of Array.from(document.body.children)) {
    if (sibling instanceof HTMLElement && !sibling.contains(container) && !sibling.inert) {
      sibling.inert = true;
      inerted.push(sibling);
    }
  }
`,
          ],
          [
            `  return () => document.removeEventListener("keydown", onKeydown);`,
            `  return () => {
    document.removeEventListener("keydown", onKeydown);
    for (const el of inerted) el.inert = false;
  };`,
          ],
        ],
      },
    },
    {
      label: "button-loading-focus",
      message: `Button: keep focus when entering the loading state

Setting \`disabled\` while loading drops the button out of the tab order, so
pressing Enter on "Save" threw focus back to <body> and screen readers lost
their place. Use aria-disabled for loading and swallow clicks instead;
real \`disabled\` still behaves as before.`,
      author: "kofi",
      daysAgo: 116,
      changes: {
        "src/components/Button.svelte": [
          [
            `  disabled={disabled || loading}
  aria-busy={loading}
  {onclick}`,
            `  {disabled}
  aria-disabled={loading || undefined}
  aria-busy={loading}
  onclick={loading ? undefined : onclick}`,
          ],
          [
            `  .atlas-button:disabled {`,
            `  .atlas-button[aria-disabled="true"] {
    cursor: progress;
  }
  .atlas-button:disabled {`,
          ],
        ],
      },
    },
    {
      label: "release-1.1.0",
      message: `Release 1.1.0

Tooltip announcement fix, focus trap inerts the page, Button keeps focus
while loading, and the new radius tokens.`,
      author: "mira",
      daysAgo: 105,
      changes: {
        "package.json": [[`"version": "1.0.0"`, `"version": "1.1.0"`]],
        "CHANGELOG.md": [
          [
            `## Unreleased\n`,
            `## Unreleased

## 1.1.0

- Tooltip is always in the DOM and toggled with \`hidden\`, so VoiceOver
  announces it on focus. 300ms show delay; Escape dismisses it without
  closing a surrounding Dialog.
- Focus trap marks the rest of the page \`inert\` while active.
- Button keeps focus while \`loading\` (uses \`aria-disabled\`).
- New \`radius\` tokens: \`sm\`, \`md\`, \`lg\`, \`pill\`.
`,
          ],
        ],
      },
    },
    {
      label: "dialog-restore-focus",
      message: `Dialog: return focus to the opener on close

After closing a dialog, focus landed on <body> and keyboard users had to
tab from the top of the page to get back to where they were. Remember
document.activeElement when the trap starts and refocus it on release, as
long as it's still in the document (the opener may have been removed by
whatever the dialog did, e.g. "Delete row").`,
      author: "self",
      daysAgo: 96,
      changes: {
        "src/components/Dialog.svelte": [
          [
            `  $effect(() => {
    if (!open || !panel) return;
    const release = trapFocus(panel);
    return release;
  });`,
            `  $effect(() => {
    if (!open || !panel) return;
    // Remember who opened us so keyboard users land back where they were.
    const opener = document.activeElement as HTMLElement | null;
    const release = trapFocus(panel);
    return () => {
      release();
      if (opener?.isConnected) opener.focus();
    };
  });`,
          ],
        ],
      },
    },
    {
      label: "docs-token-tiers",
      message: `docs: explain the token tiers in the contributing guide

The "never import palette" rule kept coming up in review without anyone
saying why. Spell out the two tiers, what each is for, and how to propose
a new semantic token.`,
      author: "lena",
      daysAgo: 89,
      changes: {
        "docs/contributing.md": [
          [
            `## Tokens

Don't add a new color without a semantic name and a reason. Components never
import \`palette\` directly.
`,
            `## Tokens

Tokens have two tiers:

1. **palette** holds raw values with no meaning attached (\`ink500\`,
   \`moss600\`). It exists so the semantic tier has something to point at.
2. **color**, **space** and **radius** hold names that describe a job
   (\`textMuted\`, \`danger\`, \`space.md\`). Components only use these.

The split is what makes theming possible: a dark scheme swaps what
\`textMuted\` points at, and no component changes. If a component imports
\`palette\`, it will look wrong in every theme but the default one.

To propose a new semantic token, open an issue with the job it does, where
it's used, and why an existing token can't do that job. Expect some pushback;
that's the point.
`,
          ],
        ],
      },
    },
    {
      label: "contrast-muted",
      message: `colors: darken ink500 so textMuted passes AA

textMuted (ink500, #7a8190) measured 3.7:1 on paper, below the 4.5:1 AA
minimum for body text, and it's used for helper text at 13px.
#5b6270 is 5.9:1 on paper and still reads as secondary next to ink900.
ink300 stays as is; it's only used for borders and disabled icons.`,
      author: "yuki",
      daysAgo: 80,
      changes: {
        "src/tokens/colors.ts": [[`  ink500: "#7a8190",`, `  ink500: "#5b6270",`]],
      },
    },
    {
      label: "build-declarations",
      message: `build: emit type declarations for both entry points

Consumers on moduleResolution "bundler" got \`any\` for everything imported
from "@fieldwork/atlas-ui/tokens", because the export map pointed at source
.ts files that svelte-package then didn't ship. Point both entries at dist
with explicit "types" conditions.`,
      author: "tomas",
      daysAgo: 71,
      changes: {
        "tsconfig.json": [[`    "strict": true,\n`, `    "strict": true,\n    "declaration": true,\n`]],
        "package.json": [
          [
            `    ".": "./src/components/index.ts",`,
            `    ".": {
      "types": "./dist/components/index.d.ts",
      "svelte": "./dist/components/index.js"
    },`,
          ],
          [
            `    "./tokens": "./src/tokens/index.ts"`,
            `    "./tokens": {
      "types": "./dist/tokens/index.d.ts",
      "default": "./dist/tokens/index.js"
    }`,
          ],
        ],
      },
    },
    {
      label: "tooltip-placement",
      message: `Tooltip: flip placement when the preferred side would clip

Tooltips on the top toolbar rendered above the viewport and were cut off
entirely. Measure the anchor when the show timer fires and flip to the
other side if the preferred one doesn't have ~40px of room. If neither
side has room we keep the preferred one: clipping a little is better than
a tooltip that jumps around as you scroll.

The placement logic lives in src/lib/placement.ts so it can be tested
without a DOM.`,
      author: "self",
      daysAgo: 62,
      changes: {
        "src/lib/placement.ts": `export type Placement = "top" | "bottom";

// Room needed on a side before we'll put the tooltip there: roughly two lines
// of 13px text, padding, and the 6px offset.
const MIN_ROOM = 40;

// Flip to the opposite side when the preferred one would clip the viewport.
// If neither side has room, keep the preferred one; clipping a little beats
// jumping around.
export function choosePlacement(
  rect: Pick<DOMRect, "top" | "bottom">,
  preferred: Placement,
  viewportHeight: number,
): Placement {
  const roomAbove = rect.top;
  const roomBelow = viewportHeight - rect.bottom;
  if (preferred === "top" && roomAbove < MIN_ROOM && roomBelow >= MIN_ROOM) return "bottom";
  if (preferred === "bottom" && roomBelow < MIN_ROOM && roomAbove >= MIN_ROOM) return "top";
  return preferred;
}
`,
        "src/components/Tooltip.svelte": [
          [
            `  import type { Snippet } from "svelte";`,
            `  import type { Snippet } from "svelte";
  import { choosePlacement } from "../lib/placement";`,
          ],
          [
            `  let open = $state(false);\n`,
            `  let open = $state(false);
  let anchor: HTMLSpanElement;
  let resolved = $state(placement);
`,
          ],
          [
            `    timer = setTimeout(() => (open = true), 300);`,
            `    timer = setTimeout(() => {
      resolved = choosePlacement(anchor.getBoundingClientRect(), placement, window.innerHeight);
      open = true;
    }, 300);`,
          ],
          [`  class="atlas-tooltip-anchor"\n`, `  bind:this={anchor}\n  class="atlas-tooltip-anchor"\n`],
          [`class="atlas-tooltip {placement}"`, `class="atlas-tooltip {resolved}"`],
        ],
      },
    },
    {
      label: "placement-tests",
      message: `Tooltip: test placement flipping near viewport edges

Covers both flips and the "no room anywhere" case that motivated keeping
the preferred side.`,
      author: "self",
      daysAgo: 61,
      changes: {
        "src/lib/placement.test.ts": `import { describe, expect, it } from "vitest";
import { choosePlacement } from "./placement";

const vh = 800;

describe("choosePlacement", () => {
  it("keeps the preferred side when there is room", () => {
    expect(choosePlacement({ top: 300, bottom: 330 }, "top", vh)).toBe("top");
    expect(choosePlacement({ top: 300, bottom: 330 }, "bottom", vh)).toBe("bottom");
  });

  it("flips to bottom near the top edge", () => {
    expect(choosePlacement({ top: 12, bottom: 44 }, "top", vh)).toBe("bottom");
  });

  it("flips to top near the bottom edge", () => {
    expect(choosePlacement({ top: 770, bottom: 796 }, "bottom", vh)).toBe("top");
  });

  it("stays put when neither side has room", () => {
    expect(choosePlacement({ top: 10, bottom: 30 }, "top", 50)).toBe("top");
  });
});
`,
      },
    },
    {
      label: "dark-scheme",
      message: `colors: add a dark scheme

Same semantic names as \`color\`, so no component changes. Raised surfaces
get lighter rather than darker so elevation still reads without shadows,
and the accent is lifted two steps so it holds 4.5:1 on surface.

cssVariables() takes an optional scheme; the default is still "light" so
existing callers are unaffected.`,
      author: "mira",
      daysAgo: 46,
      changes: {
        "src/tokens/colors.ts": [
          [
            `export type ColorToken = keyof typeof color;\n`,
            `export type ColorToken = keyof typeof color;

// Dark scheme. Same semantic names, so components don't change. Raised
// surfaces get lighter, not darker, so elevation still reads.
export const colorDark: Record<ColorToken, string> = {
  textPrimary: "#eceef2",
  textMuted: "#a3a9b5",
  surface: "#14161a",
  surfaceRaised: "#1f2228",
  border: "#2c3038",
  accent: "#6fae86",
  accentHover: "#86c29c",
  danger: "#e07a62",
  warning: "#ddb453",
  focusRing: "#79aee6",
};
`,
          ],
          [
            `export function cssVariables(): string {
  return Object.entries(color)`,
            `export function cssVariables(scheme: "light" | "dark" = "light"): string {
  return Object.entries(scheme === "dark" ? colorDark : color)`,
          ],
        ],
        "src/tokens/index.ts": [
          [`export { palette, color, cssVariables } from "./colors";`, `export { palette, color, colorDark, cssVariables } from "./colors";`],
        ],
      },
    },
    {
      label: "dialog-labelledby",
      message: `Dialog: name the dialog after its title

With a title present, screen readers announced "dialog" and nothing else,
then read the title as ordinary content. Give the heading an id and point
aria-labelledby at it. Untitled dialogs are unchanged; callers should pass
aria-label themselves in that case (documented next).`,
      author: "kofi",
      daysAgo: 34,
      changes: {
        "src/components/Dialog.svelte": [
          [
            `  let panel: HTMLDivElement | undefined = $state();`,
            `  let panel: HTMLDivElement | undefined = $state();
  const titleId = "atlas-dialog-title-" + Math.random().toString(36).slice(2, 8);`,
          ],
          [`    aria-modal="true"\n`, `    aria-modal="true"\n    aria-labelledby={title ? titleId : undefined}\n`],
          [`      <h2 class="title">{title}</h2>`, `      <h2 id={titleId} class="title">{title}</h2>`],
        ],
      },
    },
    {
      label: "release-1.2.0",
      message: `Release 1.2.0

Dark scheme, tooltip placement flipping, Dialog focus restore and
labelling, and type declarations that actually ship.`,
      author: "mira",
      daysAgo: 22,
      changes: {
        "package.json": [[`"version": "1.1.0"`, `"version": "1.2.0"`]],
        "CHANGELOG.md": [
          [
            `## Unreleased\n`,
            `## Unreleased

## 1.2.0

- Dark scheme: \`colorDark\` and \`cssVariables("dark")\`.
- Tooltip flips to the other side when the preferred one would clip.
- Dialog returns focus to the element that opened it, and is labelled by
  its title.
- \`textMuted\` now passes AA on paper (ink500 is #5b6270).
- Both entry points ship \`.d.ts\` files.
`,
          ],
        ],
      },
    },
    {
      label: "readme-theming",
      message: `README: document theming and the dark scheme

People kept asking how to switch themes after the dark scheme landed. Short version in the
README; the playground already has a toggle to copy from.`,
      author: "yuki",
      daysAgo: 10,
      changes: {
        "README.md": [
          [
            `## Components\n`,
            `## Theming

Inject \`cssVariables()\` under \`:root\` and \`cssVariables("dark")\` under
\`:root[data-theme="dark"]\`, or inside a \`prefers-color-scheme: dark\` media
query if you don't offer a manual toggle. Components only read the
\`--atlas-*\` variables, so nothing else changes between schemes.

## Components
`,
          ],
          [`| Modal, traps focus, closes on Escape |`, `| Modal, traps focus, closes on Escape, restores focus on close |`],
        ],
      },
    },
    {
      label: "focus-trap-details",
      message: `focusTrap: skip controls inside closed <details>

Content inside a closed <details> still has an offsetParent in Safari,
so the trap counted it as tabbable and Shift+Tab from the first field
"wrapped" to a link nobody could see. Exclude anything that isn't the
summary of a closed details element.`,
      author: "lena",
      daysAgo: 2,
      changes: {
        "src/lib/focusTrap.ts": [
          [
            `    (el) => el.offsetParent !== null || el === document.activeElement,`,
            `    (el) =>
      (el.offsetParent !== null || el === document.activeElement) &&
      !el.closest("details:not([open]) > :not(summary)"),`,
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "Tooltip isn't announced by VoiceOver when its trigger gets focus",
      author: "kofi",
      daysAgo: 146,
      labels: ["a11y", "bug"],
      assignees: ["mira"],
      state: "solved",
      closedHoursAfter: 130,
      body: `Safari 18 + VoiceOver, tabbing onto a Button wrapped in a Tooltip:

- Expected: "Save draft, button, Saves without publishing"
- Actual: "Save draft, button", then silence

NVDA + Firefox announces it correctly. Inspecting the tree, \`aria-describedby\`
is set on the anchor at the same tick the tooltip span is inserted, so I
suspect VoiceOver resolves the reference before the node exists.`,
      comments: [
        {
          author: "mira",
          body: "Yes, that's it. VoiceOver computes the description once on focus and doesn't recompute when the referenced node appears. We should render the tooltip always and toggle `hidden`; hidden content is still used for the accessible description.",
          hoursAfter: 4,
          reactions: [{ emoji: "👍", by: ["kofi", "yuki"] }],
        },
        {
          author: "yuki",
          body: "While you're in there: hovering across the toolbar flashes every tooltip. A short show delay would help sighted users too.",
          hoursAfter: 9,
        },
        {
          author: "mira",
          body: "Fixed both on main, will go out in 1.1.0.",
          hoursAfter: 128,
          replyTo: 0,
          reactions: [{ emoji: "🎉", by: ["kofi"] }],
        },
      ],
    },
    {
      title: "Escape inside a Tooltip closes the surrounding Dialog",
      author: "tomas",
      daysAgo: 144,
      labels: ["a11y", "bug"],
      state: "solved",
      closedHoursAfter: 72,
      body: `Open a Dialog, focus a button that has a Tooltip, press Escape. I expect the
first Escape to dismiss the tooltip and the second to close the dialog.
Instead the dialog closes immediately. Small thing, but it's the pattern
WAI-ARIA describes and it's what our QA checklist tests.`,
      comments: [
        {
          author: "mira",
          body: "Tooltip doesn't handle keys at all right now, so the event bubbles straight to the dialog. I'll add an Escape handler that stops propagation only when the tooltip is actually open.",
          hoursAfter: 20,
        },
        {
          author: "tomas",
          body: "Confirmed fixed on main. Thanks!",
          hoursAfter: 70,
          reactions: [{ emoji: "👍", by: ["mira"] }],
        },
      ],
    },
    {
      title: "Token naming: keep camelCase semantic names or move to role-based (fg.muted, bg.raised)?",
      author: "self",
      daysAgo: 58,
      labels: ["tokens", "discussion"],
      body: `Now that we have a dark scheme coming, I've been mapping our tokens against
the Figma library and the names are drifting:

| Code | Figma |
| --- | --- |
| \`textPrimary\` | fg/default |
| \`textMuted\` | fg/muted |
| \`surface\` | bg/canvas |
| \`surfaceRaised\` | bg/raised |
| \`border\` | border/default |

Designers think in role + emphasis ("foreground, muted"), and the flat
camelCase list is going to get long once we add states (\`accentHover\`,
\`accentPressed\`, \`dangerHover\`...).

Proposal: nested, role-first names in code to match Figma, e.g.
\`color.fg.muted\`, \`color.bg.raised\`, \`color.accent.hover\`. CSS variables
become \`--atlas-fg-muted\` etc. We'd keep the old names as deprecated aliases
for one minor release.

Not attached to the exact words; mostly want code and Figma to say the same
thing so handoff stops involving a lookup table.`,
      comments: [
        {
          author: "mira",
          body: "I like the direction. The flat list was fine at ten tokens; it won't be at forty. My only worry is churn for client projects that already use the CSS variables directly. Aliases for one minor feels short; can we keep them through 2.x?",
          hoursAfter: 6,
        },
        {
          author: "yuki",
          body: "Mild objection: nesting makes `keyof typeof color` less useful as a type. `ColorToken` is used in a couple of client codebases for props like `tone`. If we nest, we need a path type (`\"fg.muted\" | ...`) or we lose that.",
          hoursAfter: 11,
        },
        {
          author: "self",
          body: "Fair. A template literal path type is maybe ten lines, I can include it. And agreed on keeping aliases for all of 2.x, with a dev-only console warning when the old variable names are read through `cssVariables()`.",
          hoursAfter: 14,
          replyTo: 1,
          reactions: [{ emoji: "👍", by: ["yuki"] }],
        },
        {
          author: "lena",
          body: "From the docs side: please keep the role vocabulary small. fg, bg, border, accent, danger, warning. Every extra role is a page I have to write.",
          hoursAfter: 30,
          reactions: [{ emoji: "😄", by: ["mira", "self"] }],
        },
        {
          author: "mira",
          body: "Let's do it for 2.0. @self, want to draft the mapping table as a patch to docs first, before any code moves?",
          hoursAfter: 52,
          reactions: [{ emoji: "👍", by: ["self"] }],
        },
      ],
    },
    {
      title: "Dark scheme: border is nearly invisible on surfaceRaised",
      author: "lena",
      daysAgo: 40,
      labels: ["dark-mode", "tokens"],
      assignees: ["mira"],
      body: `In the dark scheme, a secondary Button sitting on a raised panel (Dialog,
popover) has no visible edge. \`border\` is #2c3038 and \`surfaceRaised\` is
#1f2228, which is about 1.3:1. WCAG 1.4.11 wants 3:1 for the boundary of a
control that has no other visual affordance.

Screenshot from the docs playground: the "Cancel" button in the confirm
dialog looks like plain text.`,
      comments: [
        {
          author: "mira",
          body: "Good catch. I tuned border against `surface`, not `surfaceRaised`. Two options: lighten border globally, or add `borderStrong` for controls and keep `border` for dividers. I lean towards the second, dividers really should stay quiet.",
          hoursAfter: 5,
        },
        {
          author: "kofi",
          body: "+1 for `borderStrong`. Light mode has the same issue, it's just less obvious: #e4e7ec on white is 1.2:1.",
          hoursAfter: 8,
          reactions: [{ emoji: "👀", by: ["mira", "lena"] }],
        },
        {
          author: "self",
          body: "If we land the role-based token names first this would be `border.strong`. Happy to fold it into that patch so we only rename once.",
          hoursAfter: 26,
        },
      ],
    },
    {
      title: "Docs: show how to compose Tooltip with an icon-only Button",
      author: "self",
      daysAgo: 30,
      labels: ["docs", "good-first-issue"],
      body: `The most common thing people build with atlas-ui is a toolbar of icon
buttons with tooltips, and the README doesn't show it. Two things trip
people up:

1. The tooltip is a *description*, not a *label*. An icon-only button still
   needs an accessible name, otherwise VoiceOver reads "button, Bold".
2. The Tooltip must wrap the Button, not sit inside it.

A short example plus a "don't" would save a lot of review comments.`,
      comments: [
        {
          author: "lena",
          body: "Happy to write this once there's a blessed way to give Button an accessible name. Right now you'd have to pass `aria-label` through rest props, which Button doesn't forward.",
          hoursAfter: 18,
        },
        {
          author: "self",
          body: "Right, that's the gap. I'll open a patch adding an `iconOnly` + `label` API to Button, then this issue is just docs.",
          hoursAfter: 22,
          replyTo: 0,
          reactions: [{ emoji: "🚀", by: ["lena"] }],
        },
      ],
    },
    {
      title: "textMuted fails contrast on paper (3.7:1)",
      author: "ada",
      daysAgo: 84,
      labels: ["a11y", "tokens"],
      state: "solved",
      closedHoursAfter: 100,
      body: `Using atlas-ui in a client form, helper text under inputs is \`textMuted\`
at 13px. Measured #7a8190 on #fbfaf7: 3.7:1. AA for normal-size text is
4.5:1. Our accessibility audit flagged every form.`,
      comments: [
        {
          author: "yuki",
          body: "Confirmed. I'll darken ink500 rather than repoint textMuted, since ink500 isn't used anywhere else that needs it light.",
          hoursAfter: 3,
          reactions: [{ emoji: "👍", by: ["ada"] }],
        },
        {
          author: "ada",
          body: "Thanks. #5b6270 passes in our audit tool too.",
          hoursAfter: 98,
        },
      ],
    },
    {
      title: "Button drops focus when it switches to loading",
      author: "oskar",
      daysAgo: 120,
      labels: ["a11y", "bug"],
      state: "solved",
      closedHoursAfter: 96,
      body: `Press Enter on a submit Button that sets \`loading\` while the request
runs. Focus jumps to <body>. Screen reader users then hear nothing when the
request finishes, and keyboard users start from the top of the page.`,
      comments: [
        {
          author: "kofi",
          body: "It's the `disabled={disabled || loading}`. Disabled buttons can't hold focus. I'll switch loading to aria-disabled.",
          hoursAfter: 2,
        },
      ],
    },
    {
      title: "Respect prefers-reduced-motion in Dialog and Tooltip",
      author: "sol",
      daysAgo: 14,
      labels: ["a11y"],
      body: `We're about to add an open/close transition to Dialog in our app by
wrapping it, and I noticed atlas-ui has no motion story at all yet. Before
people start adding transitions on top, could the library define a
\`motion\` token (durations, easing) that collapses to 0 under
\`prefers-reduced-motion: reduce\`?`,
      comments: [
        {
          author: "yuki",
          body: "Yes please. Tooltip's 300ms delay isn't motion so it can stay, but any fade we add should go through a token.",
          hoursAfter: 7,
        },
        {
          author: "sol",
          body: "Sketch: `motion.fast` 120ms, `motion.base` 200ms, `easing.standard`. I can put up a patch if that shape works for you.",
          hoursAfter: 31,
          reactions: [{ emoji: "👍", by: ["yuki", "mira"] }],
        },
      ],
    },
  ],
  patches: [
    {
      title: "Button: add iconOnly variant with a required label",
      author: "self",
      daysAgo: 6,
      labels: ["a11y"],
      state: "open",
      revisions: [
        {
          description: `Adds \`iconOnly\` and \`label\` props to Button. When \`iconOnly\` is set the
button is square, and \`label\` becomes both its accessible name
(\`aria-label\`) and its native \`title\`. Missing labels log a warning.

This unblocks the toolbar docs example lena offered to write: a toolbar of icon buttons, each
wrapped in a Tooltip for the longer description.`,
          hoursAfter: 0,
          base: "readme-theming",
          commits: [
            {
              message: `Button: add iconOnly variant with required label

Icon-only buttons need an accessible name, and Button didn't forward
aria-label. Make it a first-class prop so the right thing is the easy
thing. The label is also used as the native title for pointer users who
aren't using a Tooltip.`,
              author: "self",
              daysAgo: 6,
              changes: {
                "src/components/Button.svelte": [
                  [
                    `    loading?: boolean;\n`,
                    `    loading?: boolean;
    /** Render as a square icon button. Requires \`label\`. */
    iconOnly?: boolean;
    label?: string;
`,
                  ],
                  [`    loading = false,\n`, `    loading = false,\n    iconOnly = false,\n    label,\n`],
                  [
                    `  }: Props = $props();\n`,
                    `  }: Props = $props();

  if (iconOnly && !label) {
    console.warn("atlas-ui: <Button iconOnly> needs a label for screen readers.");
  }
`,
                  ],
                  [
                    `  class="atlas-button {variant} {size}"\n`,
                    `  class="atlas-button {variant} {size}"
  class:icon-only={iconOnly}
  aria-label={iconOnly ? label : undefined}
  title={iconOnly ? label : undefined}
`,
                  ],
                  [
                    `  .primary {\n`,
                    `  .icon-only {
    padding: 0;
    aspect-ratio: 1;
    justify-content: center;
  }
  .primary {
`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "mira",
              hoursAfter: 20,
              summary: `Nice, this is the API I wanted. Two things before it goes in: the warning
will ship to production, and I'm not sure about the small size as an icon
target.`,
              comments: [
                {
                  body: "This runs in production builds too and will spam client consoles. Gate it on `import.meta.env.DEV` so it tree-shakes away.",
                  path: "src/components/Button.svelte",
                  line: 32,
                  endLine: 34,
                  resolved: true,
                },
                {
                  body: "With `iconOnly`, `sm` becomes a 32×32 target. That clears WCAG 2.5.8's 24px minimum, but our own guideline says 40 for anything touch-reachable. Should iconOnly force `md`, or do we just document it?",
                  path: "src/components/Button.svelte",
                  line: 70,
                },
              ],
            },
          ],
          comments: [
            {
              author: "lena",
              body: "Once this lands I'll write the toolbar example for the docs issue. Would be great to have a CHANGELOG line I can link to.",
              hoursAfter: 26,
            },
          ],
        },
        {
          description: `Revision 2: the missing-label warning is now dev-only, and there's a
CHANGELOG entry. Left \`sm\` alone for now; see the thread on the size
question.`,
          hoursAfter: 46,
          commits: [
            {
              message: `Button: only warn about missing labels in dev builds

Review feedback from mira: the warning shouldn't reach production
consoles. import.meta.env.DEV is statically replaced by Vite, so the
whole block is dropped from production bundles.`,
              author: "self",
              daysAgo: 4,
              changes: {
                "src/components/Button.svelte": [
                  [`  if (iconOnly && !label) {`, `  if (import.meta.env.DEV && iconOnly && !label) {`],
                ],
                "CHANGELOG.md": [
                  [
                    `## Unreleased\n`,
                    `## Unreleased

- Button: \`iconOnly\` and \`label\` props for icon buttons with an accessible
  name. Warns in dev when \`label\` is missing.
`,
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "yuki",
              hoursAfter: 52,
              summary: `Code looks good to me. On the size question I'd document it rather than
force \`md\`; dense desktop toolbars are a real use case. Leaving the merge to
mira since she raised it.`,
            },
          ],
          comments: [
            {
              author: "self",
              body: "Agree with documenting it. I'll add a note to the Button section of the README in the toolbar example lena is writing, so it lives next to the pattern that needs it.",
              hoursAfter: 55,
              reactions: [{ emoji: "👍", by: ["yuki", "lena"] }],
            },
          ],
        },
      ],
    },
    {
      title: "tokens: generate a static atlas.css at build time",
      author: "yuki",
      daysAgo: 3,
      labels: ["tokens"],
      state: "open",
      revisions: [
        {
          description: `Adds scripts/build-tokens.ts, run after svelte-package, which writes
\`dist/atlas.css\` with light and dark variables. Apps that don't run JS at
startup (the docs site, email previews, the marketing pages) can link the
stylesheet instead of calling \`cssVariables()\`.

The dark block is emitted twice: once for an explicit \`data-theme\`, once
under \`prefers-color-scheme\` for apps without a toggle.`,
          hoursAfter: 0,
          base: "readme-theming",
          commits: [
            {
              message: `tokens: emit dist/atlas.css during build

Static CSS for consumers that can't call cssVariables() at runtime. Uses
tsx so the script can import the token modules directly; no separate
build step for the generator.`,
              author: "yuki",
              daysAgo: 3,
              changes: {
                "scripts/build-tokens.ts": `// Writes dist/atlas.css so apps that don't run JS at startup (docs site,
// email previews) can still use the tokens.
import { mkdirSync, writeFileSync } from "node:fs";
import { cssVariables } from "../src/tokens/colors";

const css = [
  ":root {",
  cssVariables("light"),
  "}",
  "",
  ':root[data-theme="dark"] {',
  cssVariables("dark"),
  "}",
  "",
  "@media (prefers-color-scheme: dark) {",
  '  :root:not([data-theme="light"]) {',
  cssVariables("dark"),
  "  }",
  "}",
  "",
].join("\\n");

mkdirSync("dist", { recursive: true });
writeFileSync("dist/atlas.css", css);
console.log("wrote dist/atlas.css (" + css.length + " bytes)");
`,
                "package.json": [
                  [
                    `    "build": "svelte-package -i src -o dist",`,
                    `    "build": "svelte-package -i src -o dist && tsx scripts/build-tokens.ts",`,
                  ],
                  [`    "svelte-check": "^4.0.0",\n`, `    "svelte-check": "^4.0.0",\n    "tsx": "^4.19.0",\n`],
                ],
              },
            },
          ],
          comments: [
            {
              author: "kofi",
              body: "Spacing and radius aren't in the generated file, only colors. Intentional? The docs site uses `--atlas-space-*` everywhere.",
              hoursAfter: 5,
            },
            {
              author: "yuki",
              body: "Not intentional, cssVariables() only knows about colors. I'll generalise it in a second revision. Would appreciate a second pair of eyes from someone who uses the tokens in app code (@self?).",
              hoursAfter: 8,
              replyTo: 0,
            },
          ],
        },
      ],
    },
    {
      title: "WIP: Combobox with listbox popup",
      author: "kofi",
      daysAgo: 12,
      labels: ["a11y"],
      state: "draft",
      revisions: [
        {
          description: `Early draft of a Combobox following the ARIA 1.2 combobox pattern
(input + listbox, aria-activedescendant for the highlighted option).

Not ready: no filtering strategy beyond startsWith, no async options, and
I haven't tested NVDA yet. Pushing so mira and yuki can comment on the
props shape before I go further.`,
          hoursAfter: 0,
          base: "dialog-labelledby",
          commits: [
            {
              message: `Combobox: first pass at input + listbox

Arrow keys move the active option, Enter selects, Escape closes the list
and then clears on a second press, matching the APG example.`,
              author: "kofi",
              daysAgo: 12,
              changes: {
                "src/components/Combobox.svelte": `<script lang="ts">
  interface Option {
    value: string;
    label: string;
  }

  interface Props {
    label: string;
    options: Option[];
    value?: string;
    onchange?: (value: string) => void;
  }

  let { label, options, value = $bindable(""), onchange }: Props = $props();

  const id = "atlas-combobox-" + Math.random().toString(36).slice(2, 8);
  let query = $state("");
  let expanded = $state(false);
  let active = $state(-1);

  // TODO: fuzzy matching? startsWith is what the APG example does.
  let filtered = $derived(
    options.filter((o) => o.label.toLowerCase().startsWith(query.toLowerCase())),
  );

  function select(option: Option) {
    value = option.value;
    query = option.label;
    expanded = false;
    onchange?.(option.value);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      expanded = true;
      active = Math.min(active + 1, filtered.length - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (event.key === "Enter" && expanded && filtered[active]) {
      event.preventDefault();
      select(filtered[active]);
    } else if (event.key === "Escape") {
      if (expanded) expanded = false;
      else query = "";
    }
  }
</script>

<label for={id}>{label}</label>
<input
  {id}
  role="combobox"
  aria-expanded={expanded}
  aria-controls="{id}-list"
  aria-activedescendant={active >= 0 ? id + "-opt-" + active : undefined}
  aria-autocomplete="list"
  bind:value={query}
  oninput={() => ((expanded = true), (active = -1))}
  {onkeydown}
/>
{#if expanded && filtered.length > 0}
  <ul id="{id}-list" role="listbox" aria-label={label}>
    {#each filtered as option, i (option.value)}
      <li
        id="{id}-opt-{i}"
        role="option"
        aria-selected={i === active}
        onmousedown={() => select(option)}
      >
        {option.label}
      </li>
    {/each}
  </ul>
{/if}
`,
              },
            },
          ],
          comments: [
            {
              author: "yuki",
              body: "Props shape looks right. One early note: `onmousedown` on the options won't fire for touch screen readers that synthesise clicks. Use `onclick` and prevent the input's blur from closing the list instead.",
              hoursAfter: 30,
            },
          ],
        },
      ],
    },
    {
      title: "Ship a custom-elements build alongside the Svelte components",
      author: "tomas",
      daysAgo: 78,
      labels: ["build"],
      state: "archived",
      revisions: [
        {
          description: `Two client projects are on React and want atlas-ui. Svelte 5 can compile
components to custom elements, so this adds a second Vite build that
registers \`<atlas-button>\`, \`<atlas-tooltip>\` and \`<atlas-dialog>\`.`,
          hoursAfter: 0,
          base: "contrast-muted",
          commits: [
            {
              message: `build: add custom elements entry

Registers the three components as custom elements via Svelte's
customElement compile option. Separate build so the Svelte package is
unaffected.`,
              author: "tomas",
              daysAgo: 78,
              changes: {
                "src/elements.ts": `// Entry for the custom-elements build (vite.elements.config.ts). Each
// component is compiled with customElement: true and registered here.
import Button from "./components/Button.svelte";
import Tooltip from "./components/Tooltip.svelte";
import Dialog from "./components/Dialog.svelte";

const elements = {
  "atlas-button": Button,
  "atlas-tooltip": Tooltip,
  "atlas-dialog": Dialog,
};

for (const [name, component] of Object.entries(elements)) {
  const ctor = (component as unknown as { element?: CustomElementConstructor }).element;
  if (ctor && !customElements.get(name)) customElements.define(name, ctor);
}
`,
                "package.json": [
                  [
                    `    "check": "svelte-check --tsconfig ./tsconfig.json",`,
                    `    "build:elements": "vite build --config vite.elements.config.ts",
    "check": "svelte-check --tsconfig ./tsconfig.json",`,
                  ],
                ],
              },
            },
          ],
          comments: [
            {
              author: "mira",
              body: "I tried this against the Dialog and it falls apart in the shadow root: the focus trap queries `document.body.children`, and `inert` on siblings doesn't reach into other shadow trees. Tooltip positioning has the same problem. Making these work properly is basically a second library.",
              hoursAfter: 22,
            },
            {
              author: "yuki",
              body: "Agree with mira. For the React projects I'd rather share tokens (CSS variables work everywhere) and let them use their own primitives.",
              hoursAfter: 30,
            },
            {
              author: "tomas",
              body: "Fair, I underestimated the focus management side. Archiving. I'll open an issue about publishing a framework-free tokens package instead.",
              hoursAfter: 47,
              reactions: [{ emoji: "👍", by: ["mira", "yuki"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Dialog: return focus to the opener on close",
      author: "self",
      daysAgo: 98,
      labels: ["a11y"],
      state: "merged",
      revisions: [
        {
          description: `After a dialog closes, focus currently lands on <body>. This remembers the
active element when the dialog opens and focuses it again on close, if it
still exists.

Tested with VoiceOver + Safari and keyboard-only in Firefox. Haven't got
NVDA handy; would appreciate a check from someone who does.`,
          hoursAfter: 0,
          fromHistory: ["dialog-restore-focus"],
          reviews: [
            {
              author: "yuki",
              hoursAfter: 30,
              verdict: "accept",
              summary: "Checked with NVDA + Firefox: focus goes back to the trigger and NVDA re-announces it. The isConnected guard is a nice touch. Merging.",
            },
          ],
        },
      ],
    },
    {
      title: "Tooltip: flip placement near viewport edges",
      author: "self",
      daysAgo: 64,
      labels: ["bug"],
      state: "merged",
      revisions: [
        {
          description: `Tooltips on the app's top toolbar render above the viewport and get cut
off. This measures the anchor when the tooltip is about to show and flips
to the other side if there isn't room.

Placement logic is a pure function in src/lib/placement.ts with tests, so
we can extend it to left/right later without touching the component.`,
          hoursAfter: 0,
          fromHistory: ["tooltip-placement", "placement-tests"],
          reviews: [
            {
              author: "mira",
              hoursAfter: 26,
              verdict: "accept",
              summary: `Love that it's a pure function. One nit I'm not blocking on: 40px is a
magic number in two places in the description but only one in code, which
is the right way round. Merging.`,
            },
          ],
          comments: [
            {
              author: "kofi",
              body: "Tried it in the studio dashboard header, works. Could we get left/right next? Sidebar tooltips have the same issue horizontally.",
              hoursAfter: 40,
            },
          ],
        },
      ],
    },
  ],
  releases: [
    {
      tag: "v1.1.0",
      at: "release-1.1.0",
      title: "atlas-ui 1.1.0",
      notes: `Accessibility fixes across the board.

- Tooltip is now announced by VoiceOver, has a 300ms show delay, and
  Escape dismisses it without closing a surrounding Dialog.
- The focus trap makes the rest of the page \`inert\`.
- Button keeps focus while \`loading\`.
- New \`radius\` tokens.

No breaking changes.`,
      author: "mira",
      daysAgo: 105,
      artifacts: [{ name: "atlas-ui-1.1.0.tgz", sizeBytes: 41_872 }],
    },
    {
      tag: "v1.2.0",
      at: "release-1.2.0",
      title: "atlas-ui 1.2.0: dark scheme",
      notes: `Highlights:

- **Dark scheme.** \`colorDark\` and \`cssVariables("dark")\`; components need
  no changes.
- Tooltip flips placement near viewport edges.
- Dialog restores focus to its opener and is labelled by its title.
- \`textMuted\` passes WCAG AA on paper.
- Type declarations now ship for both entry points; if you were getting
  \`any\` from "@fieldwork/atlas-ui/tokens", this fixes it.

No breaking changes.`,
      author: "mira",
      daysAgo: 22,
      artifacts: [
        { name: "atlas-ui-1.2.0.tgz", sizeBytes: 48_306 },
        { name: "atlas-tokens-1.2.0.css", sizeBytes: 2_914 },
      ],
    },
  ],
};
