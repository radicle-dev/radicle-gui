# 3. Extracting shared front-end code

Date: 2026-10-27

## Status

Accepted

## Context

ADR 2 decides how the apps consume shared code: through the `@radicle-gui/ui`
package in a root npm workspace. It doesn't decide what goes into the package,
in what order, or in which shape. Desktop and explorer share a lot of UI, but
they serve different use cases. Explorer is a public web interface: anyone can
open it in a browser and browse repositories across many nodes, and it only
reads for now. Desktop is a personal app that works with one person's own node,
and both reads and writes.

## Decision

- New functionality that is meant to be reused lands in `shared/ui` first and
  is then used in both apps.
- Existing features move over gradually, one patch per feature, so that the
  related components of a feature move together.
- Functionality specific to one app stays in that app.
- Existing code is extracted from desktop and reused in explorer. When the two
  apps' copies differ, desktop's version is the starting point and explorer
  adapts to it.
- Svelte 5 is the goal. Shared components use runes, and explorer moves its
  code that uses them to runes as it adopts them, instead of in one big
  migration.
- Shared components don't know where their data comes from: they import
  nothing from either app, and each app adapts its own data to their props.
  They can offer both reading and writing; explorer uses only the reading
  side for now. Data comes in as props and changes go out through callbacks,
  following the API guidelines in `shared/ui/AGENTS.md`.
- Shared prop types stay narrow and follow heartwood's names and shapes, so
  that the apps' own types can converge on heartwood without churning the
  components. Generating both apps' types from heartwood's Rust types is the
  long-term path, and part of the later decision on a shared core.
- Design tokens, stylesheets and fonts are shared through `shared/ui/public`,
  and the apps stop keeping their own copies.
- Unit tests for shared code live in `shared/ui/tests`, and every change to
  `shared/ui` runs the checks of both apps.
- Extraction starts with visual components that both apps can use as they are.
  How to share larger pieces such as whole views is not decided yet; one
  option is to extract their business logic into a shared core later.

## Consequences

- Explorer mixes legacy and runes components until its migration is done.
- Every extraction touches both apps, so it needs both apps checked.
- Shared components can carry write paths that explorer doesn't use yet.
- Views stay duplicated between the apps until a later ADR decides how to
  share them.
