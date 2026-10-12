// Styling and worker wiring shared by the two ways the app renders a diff with
// `@pierre/diffs`: `PierreDiff` (the virtualized `CodeView`, for a whole
// revision or commit) and `PierreSnippet` (a bare `FileDiff`, for the few lines
// a review comment is about). Both inject the same per-file CSS into the same
// kind of shadow root, so it lives here rather than in either of them.
import type { WorkerPoolManager } from "@pierre/diffs/worker";

import { getOrCreateWorkerPoolSingleton } from "@pierre/diffs/worker";
// Vite bundles Pierre's highlighting worker (and its Shiki/WASM deps) into a
// self-contained, same-origin worker module.
import PierreDiffWorker from "@pierre/diffs/worker/worker.js?worker";

export const themes = { dark: "github-dark", light: "github-light" } as const;

// Shiki tokenization is the expensive part of rendering a large diff. Run it in
// a shared worker pool so it stays off the main thread; if the worker cannot be
// created (e.g. blocked by CSP), fall back to main-thread highlighting rather
// than failing to render.
let workerPoolResolved = false;
let workerPool: WorkerPoolManager | undefined;
export function getWorkerPool(): WorkerPoolManager | undefined {
  if (workerPoolResolved) {
    return workerPool;
  }
  workerPoolResolved = true;
  try {
    workerPool = getOrCreateWorkerPoolSingleton({
      poolOptions: {
        workerFactory: () => new PierreDiffWorker(),
        poolSize: 2,
        // Pierre's default is 100 entries, which a large patch blows through
        // immediately — and a miss is not just a re-tokenize. `hydrate` seeds a
        // file's render cache from this LRU, so a hit skips the plain AST
        // Pierre otherwise builds *synchronously on the main thread* to have
        // something to paint. On a thousand-file diff that turns scrolling back
        // over old ground into main-thread work per file. Traded against memory:
        // this holds a tokenized AST per file, so it is generous rather than
        // unbounded.
        totalASTLRUCacheSize: 500,
      },
      highlighterOptions: { theme: themes },
    });
  } catch (error) {
    console.error(
      "pierreView: worker pool unavailable; highlighting on the main thread",
      error,
    );
    workerPool = undefined;
  }
  return workerPool;
}

// Diff line height, rounded to a whole pixel. `1.25rem` is fractional at some
// font sizes (e.g. 17.5px at a 14px root) and WebKit snaps each rendered row to
// a whole pixel, so a fractional metric drifts scroll-to-file down a long diff.
// The same integer feeds the CSS line height and Pierre's `itemMetrics`, so the
// rendered rows and the virtualization model agree exactly.
export function codeLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.25);
}

// Pierre only emits unprefixed `user-select: none` on its gutters, which
// WebKit ignores — so with the subtree opted into selection, gutters would
// become selectable there. Re-assert it with the `-webkit-` prefix inside the
// shadow root (injected into the highest `@layer unsafe`, so it wins).
export const gutterUnsafeCSS = `
  [data-column-number],
  [data-content-buffer],
  [data-gutter-buffer],
  [data-separator-wrapper],
  [data-separator-content] {
    -webkit-user-select: none;
    user-select: none;
  }
`;

// Shared surface treatment, injected into every file's shadow root. Each file
// is its own `<diffs-container>` custom element, so `:host` — reachable from the
// per-file `unsafeCSS` — is the whole-file box (header and diff).
//
// `background: transparent` gives the "no background" look: unchanged lines show
// the app canvas, and only the change tints and whatever frame the host puts
// around the file stand out.
//
// Context separators ("N unmodified lines" / "More context" bars) are restyled
// too: recessed one surface level below the diff, rounded, no hover underline,
// and Pierre's expand glyph swapped for the app's caret (an app-file chevron
// painted via a CSS mask, like the tree's folder glyphs).
const caretMask =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='black' d='M4 5.29297L8 9.29297L12 5.29297L12.707 6L8 10.707L3.29297 6L4 5.29297Z'/%3E%3C/svg%3E\")";
export const surfaceUnsafeCSS = `
  :host {
    background: transparent;
    /* Force the diff surface to the app's view background. The Shiki theme
       sets \`--diffs-light-bg\`/\`--diffs-dark-bg\` on \`:host\` directly, so
       overriding those by inheritance fails; overriding the resolved
       \`--diffs-bg\` from this higher \`@layer\` wins. The header, lines and
       gutter read it directly, and the separator/context/change tints are
       \`color-mix\`es off it — so everything sits on the view background with
       only the syntax and add/del/mod tints standing out, while the separators
       keep their subtle Pierre tint (now mixed off our base). */
    --diffs-bg: var(--color-surface-canvas);
    /* Lift the context separators one surface level above the diff. */
    --diffs-bg-separator-override: var(--color-surface-subtle);
  }
  /* Context separators: rounded, no hover underline. */
  [data-separator-content],
  [data-separator="line-info"] [data-separator-wrapper] {
    border-radius: var(--border-radius-md);
  }
  [data-separator-content]:hover {
    text-decoration: none;
  }
  /* Swap Pierre's expand glyph for the app caret (down; flipped when the
     separator expands upward). */
  [data-expand-button] [data-icon] {
    display: none;
  }
  [data-expand-button]::before {
    content: "";
    width: 1rem;
    height: 1rem;
    background-color: currentColor;
    -webkit-mask: center / contain no-repeat ${caretMask};
    mask: center / contain no-repeat ${caretMask};
  }
  [data-expand-button][data-expand-up]::before {
    transform: rotate(180deg);
  }
`;

// A snippet is deliberately only the lines a comment is about, cut out of the
// file. Pierre still reads that as a diff with context missing either side and
// offers to expand it — but a snippet has no `loadDiffFiles` behind that
// affordance, so there is nothing for it to expand into. The separators that
// carry it go away entirely; what is left is the lines, which is the point.
// The card each file gets in a `PierreDiff`: an inset for the `overlayLeft`
// column, a rounded outline, and a header that pins to the top of the scroll
// port. Horizontal spacing via margin; vertical spacing between files stays on
// `layout.gap` (vertical margins fight the virtualizer's height math).
//
// The outline is a `box-shadow`, NOT a real border: the virtualizer computes
// each file's height from metrics (for `overflow: scroll` it never measures the
// container), so a real border's 2px would drift the layout model from the DOM —
// corrupting scroll-to targets and the sticky math for short collapsed files. A
// box-shadow adds zero layout height. It must be an *outset* ring: the diff
// surface equals the view background, so the opaque header and line backgrounds
// would paint over an inset shadow. (The header/body divider is an inset shadow
// on `DiffFileHeader`'s own row, so it adds no height and keeps the header
// matching the metric.)
//
// Corners are rounded per-element, not with `overflow: hidden` on `:host` (that
// would make the header stick within the file box instead of the scroll
// viewport). The header's opaque sticky background would otherwise square off
// over the rounded box-shadow, so we round its top corners; the body wrapper (a
// sibling of the header, not the sticky element) gets rounded and clipped bottom
// corners — safe because the horizontal scroll lives on the inner `[data-code]`.
// A header-only card (collapsed, binary, or empty — no rendered body) rounds all
// its header corners, driven by the `data-app-no-body` attribute we set on the
// host.
export const cardUnsafeCSS = `
  :host {
    /* Lines up with the horizontal padding of the chrome above the diff. The
       left inset makes room for an \`overlayLeft\` column when there is one — a
       custom property because it inherits across the shadow boundary, unlike
       the class that would otherwise carry it. */
    margin: 0 1rem 0 var(--app-diff-left-inset, 1rem);
    border-radius: var(--border-radius-md);
    box-shadow: 0 0 0 1px var(--color-border-subtle);
  }
  [data-diffs-header] {
    border-top-left-radius: var(--border-radius-md);
    border-top-right-radius: var(--border-radius-md);
    /* Must equal \`itemMetrics.diffHeaderHeight\`, and must not wait for the
       Svelte header to mount to get there. In custom mode Pierre renders this
       box around a bare slot and gives it no height of its own, so an unmounted
       slot measures zero — and the mount is deliberately deferred a microtask
       (see \`queueSlotSync\`). Pierre measures the file in the render that
       created it, finds it exactly one header short, then has to reconcile and
       re-render when the header lands: two passes and a reflow for every file
       that scrolls into view. Pinning it here means the box is right from the
       first paint and the content just fills it. */
    height: 2.5rem;
  }
  :host([data-app-no-body]) [data-diffs-header] {
    border-radius: var(--border-radius-md);
  }
  [data-diffs-header] ~ [data-diff],
  [data-diffs-header] ~ [data-file] {
    border-bottom-left-radius: var(--border-radius-md);
    border-bottom-right-radius: var(--border-radius-md);
    overflow: hidden;
  }
  /* Pin below the sticky bar rather than at the very top of the port. Driven
     by a custom property, which inherits across the shadow boundary, rather
     than by writing the height into this string: Pierre treats any change to
     the unsafe CSS as a layout change and relays out every file from the
     first. (No backticks in here — this is inside a template literal.)

     The card's border is a ring around the host, so it scrolls away with the
     card and leaves a pinned header with nothing along its top. The header
     carries that one line itself instead, as an outset shadow, which adds no
     height to the 2.5rem the virtualizer assumes. The extra pixel of offset is
     what the line needs to live in: pinned flush against the bar, it would
     fall on the bar's own last row, and the bar is opaque and paints above the
     diff. While the top of the card is still in view the offset does nothing
     (the header is not displaced at all) and the line lands in the band the
     ring already occupies, so nothing doubles up.

     The two corners are left as they are. The diff runs behind a pinned
     header, so a line's tint shows in the wedge between each arc and the
     corner of the box — but the ring is drawn in the host's own background
     layer, beneath every descendant, so anything the header paints over that
     wedge takes the corner of the ring with it. */
  [data-diffs-header][data-sticky] {
    top: calc(var(--app-sticky-top, 0px) + 1px);
    box-shadow: 0 -1px 0 0 var(--color-border-subtle);
  }
`;
