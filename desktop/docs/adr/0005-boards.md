# 5. Boards on a custom COB

Date: 2026-10-02

## Status

Proposed

## Context

We want boards in the app: a repository's issues and patches arranged in
columns, moved between columns and reordered within them, with everyone
seeing the same board. It must not need changes to heartwood.

Heartwood supports custom COB types through the public `radicle` crate,
as `radicle-job` already shows, and replicates them like issues and
patches. It doesn't cache them, and it merges ops from every peer we hold:
an op whose evaluation fails is dropped together with every op built on
it.

## Decision

**A board is a custom COB in an ordinary repository.** A repository can
have several boards. The board stores only placement (columns, and which
card sits where in what order); titles, state and labels come from the
issues and patches themselves.

**Cards are keyed by `{ rid, type, oid }`**, the structured form of the
canonical `rad:<RID>/cob/<type>/<oid>` reference from ADR 0003. Cards can
be issues and patches from the board's repository or from any other
repository we have locally. A card from a repository we don't have shows
as unresolved, and seeding that repository reveals its contents.

**Private repositories don't take part in cross-repository boards.** A
card from a private repository can only be placed on a board in that same
repository, so a board never discloses a private repository's id. The app
enforces this when cards are added.

**Concurrent edits must converge.** Moving one card never conflicts with
moving another, and concurrent reorders within a column settle on a
stable order without rewriting other cards.

**Only delegates change boards.** Ops from anyone else are ignored during
evaluation, not rejected, so they can't cause later delegate ops to be
dropped.

**The COB lives in its own crate**, depending only on `radicle`, so other
clients can reuse it. The app side follows ADR 0002.

**Development stays off the main network.** A board in a public repository
replicates to every peer that fetches it and can't be reliably withdrawn.
Until the format is stable:

- the type name is `dev.radicle.board.unstable`; it becomes
  `dev.radicle.board` once the format is stable, and from then on changes
  must stay backwards compatible;
- boards are created only on isolated setups: the E2E and `test-http-api`
  fixtures, a separate `RAD_HOME` whose node has no seeds or peers, or
  private repositories shared only with the people testing.

## Consequences

- No heartwood changes.
- Boards from the unstable period are not migrated.
- Non-delegates can't arrange cards. Allowing it changes the
  authorization rule, not the data model.