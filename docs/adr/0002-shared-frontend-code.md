# 2. Shared front-end code in an npm workspace

Date: 2026-10-21

## Status

Proposed

## Context

Desktop and explorer have copied a lot of front-end code from each other.
Desktop is the most developed of the two and already on Svelte 5, so it is the
source we extract shared code from.

We also considered consuming `shared/ui` as a plain source folder and as a
local `file:` dependency. Both need workarounds in each app's Vite and
TypeScript config, and leave `shared/ui` without its own lints and tests.

## Decision

A root npm workspace holds `shared/ui`, `explorer` and `desktop`, with one
lockfile, `.npmrc` and `.nvmrc` at the root.

`shared/ui` is the package `@radicle-gui/ui`. It has `svelte` as a peer
dependency and its own checks, lints, tests and CI workflow. The apps depend on
it and import it from source, without a build step.

Shared stylesheets and fonts live in `shared/ui/public`. A Vite plugin from the
package serves them next to each app's public directory in dev and adds them
to the build, so the apps keep their `<link>` tags, marked `vite-ignore`.

Shared code must not import `@tauri-apps/*`, `@bindings` or `@http-client`.
It takes plain props, and each app adapts its own data to them.

## Consequences

- The apps share one dependency tree. Shared code gets a single copy of
  `svelte` and its other dependencies, and is checked and tested on its own,
  without workarounds in either app.
- Dependency versions are coupled. Where the apps' ranges overlap, a bump lands
  in both, and an app that needs to diverge has to pin its own version.
- Installs and builds start from the repository root. Working on one app means
  installing it with `-w`, and Nix, Docker and CI have to use the root
  lockfile.
- Shared components are written with runes. Explorer can render them while it
  still uses legacy syntax, at the cost of some friction where the two meet.
