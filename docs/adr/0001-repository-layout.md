# 1. Repository layout

Date: 2026-10-21

## Status

Proposed

## Context

radicle-gui merged radicle-explorer and radicle-desktop. Explorer still
occupies the repository root, with desktop nested under `desktop/`. That
leaves no neutral place for project-wide docs or code shared between the two
front-ends, which is where most of the copy-pasting has happened.

## Decision

```
radicle-gui/
  AGENTS.md
  docs/
    adr/
  desktop/
  explorer/
  shared/
    ui/
```

- Explorer moves from the root into `explorer/`, next to `desktop/`.
- The root holds only project-wide files: `AGENTS.md`, ADRs under `docs/adr/`,
  and CI config.
- `shared/` holds code used by both front-ends. How the apps consume it is
  decided in ADR 2.
- Each project keeps its own Cargo workspace, toolchain files and checks.
- `radicle-httpd` and `radicle-search` stay in `explorer/` for now. Moving
  them out is a separate decision.
- Commits that touch a single component are prefixed with it: `explorer:`,
  `httpd:` or `desktop:`. Commits that span most of the repository have no
  prefix. Either way, a commit should be understandable, testable and
  revertable as one coherent change.
