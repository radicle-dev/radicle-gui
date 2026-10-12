# 3. References to Radicle entities

Date: 2026-10-02

## Status

Accepted

## Context

Issue and patch text needs to point at repos, issues, patches, commits,
files and people. That text lives in COBs as plain text and is read by every client
(this app, radicle-explorer, the CLI, IDE plugins), each rendering it as it
sees fit.

References are mostly shared as explorer URLs today, which tie the content
to one instance and seed, and make clients reverse-parse a presentation URL.
RIP 4 (`rips/0004-general-uri-scheme`) defines a general `rad:` URI instead,
and heartwood is adopting it through the `radicle-uri` crate.

## Decision

**Store canonical identifiers, not URLs.** A reference is written into the
text as an absolute identifier:

| Entity            | Identifier                                         |
| ----------------- | -------------------------------------------------- |
| Repo              | `rad:<RID>`                                        |
| Remote            | `rad:<RID>/<NID>`                                  |
| Issue             | `rad:<RID>/cob/xyz.radicle.issue/<oid>`            |
| Patch             | `rad:<RID>/cob/xyz.radicle.patch/<oid>`            |
| Release           | `rad:<RID>/cob/dev.radicle.artifact/<oid>`         |
| List of COBs      | `rad:<RID>/cob/<type>`                             |
| Commit            | `rad:<RID>/commit/<oid>`                           |
| Branch or tag     | `rad:<RID>/commit/<branch>`, `rad:<RID>/tag/<tag>` |
| File or directory | `rad:<RID>/commit/<revision>?path=<path>`          |
| Line of a file    | `rad:<RID>/commit/<revision>?path=<path>#L<n>`     |
| Person            | `did:key:<NID>`                                    |

- Object ids are always full. The composer expands a prefix and offers every
  match when several objects share it. It searches only delegate releases;
  a full release id or link resolves any release.
- Identifiers are never relative to the current repo.
- Explorer URLs are accepted as input and normalised on insert. Where a URL
  is ambiguous, as in `/tree/<branch>/<path>` with a branch containing
  slashes, the repo's refs decide when the reference is written.
- Detail RIP 4 has no form for, such as a patch revision or tab or a list's
  filters, is dropped. A page with no form at all, such as a log, stays a
  plain explorer link.

**One TypeScript library for the URI.** It lives in this repo with no
dependencies on the rest of the app, so radicle-explorer can adopt it. It
parses and formats all of RIP 4 plus `did:key:`, and maps identifiers to and
from explorer routes. It is tested against the RIP 4 vectors and
`radicle-uri`'s cases.

**Clients decide presentation.** This app shows repos, issues, patches,
releases, commits and people as chips, and every other entity above as a link
labelled with the repo name, such as `heartwood: src/lib.rs`. Either
navigates in-app when the repo is local and falls back to the configured
`publicExplorer`, which a right click also offers. A resource a client does
not support renders as a plain link. Sanitizers allow `rad:` and `did:`
hrefs, which cannot execute; this app also registers as the OS `rad:`
handler, so a link clicked elsewhere opens in it.

## Consequences

- References don't depend on any explorer instance or seed.
- Clients that don't understand `rad:` show the identifier or label without
  a working link; radicle-explorer is one today.
- Terminals such as kitty, iTerm2 and VTE only detect links of the form
  `scheme://`, so a canonical `rad:<RID>/…` is not clickable there while the
  equivalent `rad:///<RID>/…` is. Stored references and the app's "Copy rad:
  URI" keep the canonical form; output meant for terminals, such as the CLI's,
  should use `rad:///` or OSC 8 hyperlinks.
