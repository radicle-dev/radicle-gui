# 5. Boards on a custom COB

Date: 2026-10-02

## Status

Accepted

## Context

We want boards in the app: a repository's issues and patches arranged in
columns, with everyone seeing the same board.

## Decision

**A board is a custom COB in a Radicle repository.** It stores only placement:
its columns, and which column each card is in and in what order. Titles, state
and labels come from the cards. Only delegates create boards: a board whose
first op isn't signed by a delegate fails to load on every peer, and the app
creates one only when a delegate asks and confirms.

**Cards can come from any repository.** The one exception is private
repositories: their cards only go on their own boards, since a move writes the
card's repository and id into the board's history for everyone who replicates
it. `radicle-board` refuses to write such a move, and also one whose repository
it doesn't have. The evaluator can't check this, so clients that write ops some
other way aren't bound by it. Cards are keyed by `{ rid, type, oid }`, as in ADR
0003, where `oid` is the issue's or patch's id. A card from a repository we
don't have shows as unresolved.

**Concurrent edits converge.** A position is a string of base-62 digits compared
like the digits of a fraction, so there is always room between two keys (between
`a` and `b` comes `aV`) and a move never rewrites other cards; equal keys sort
by card. Heartwood applies ops in causal order: an op always comes after the ops
it was built on. Only concurrent ops are ordered by the writer's timestamp, then
op id (by op id alone for ops built directly on the board's first op). When two
people move the same card at the same time, the move that comes last wins. A
skewed clock can decide that race, but it can't undo a move its writer had
already seen.

**Delegates change boards; others move their own cards.** As in heartwood's
issues, delegates may do anything. A non-delegate may move a card from the
board's own repository in two cases: they wrote its issue or patch, or a
delegate assigned them to the issue. In the second case, the move names that
assignment op as proof. Any past assignment counts, so other clients can still
use it after the person is unassigned. This app only lets current assignees move
cards. Each board op is a git commit. A move also lists the commits it relies on
as extra parents: the issue's or patch's first op, and the assignment op if
there is one. Fetching the board then fetches those too, so every peer can check
the move, even before it has fetched the issue itself. A move whose commits
aren't among its parents is ignored, and the evaluator verifies their
signatures. Which columns a card may move between is covered under closing
columns below.

**Only issues and patches can be cards**, for delegates too. For a card in the
board's own repository, the evaluator also checks that the issue or patch exists
and really is that type, so a patch can't pass as an issue. Cards from other
repositories aren't part of the board's history, so only their type name is
checked.

**Bad actions are ignored, not rejected.** Unlike issues and patches, the
evaluator skips bad actions instead of failing their op. Heartwood drops a
failed op together with every op built on it. A move can be valid when written
and become invalid once a concurrent op is ordered before it, after others have
built on it. And one op carries a whole batch of changes. Skipping drops only
the bad action. It skips actions that fail these checks, exceed the limits
(names of 100 bytes, 50 columns, column ids of 64 bytes, positions of 64 bytes)
or repeat a column id, and ops that don't decode or lack an identity. Only a bad
first op fails, which hides that board. A move into a column the board doesn't
have still counts and closes nothing. The card shows as unplaced until the
column exists, and a delegate's or author's move doesn't depend on whether it's
ordered before or after a change that adds or removes the column.

**Columns can close issues, under the issue's own rules.** A column may close
issues as solved or as other; a new board's Done and Canceled columns do. The
evaluator lets only a delegate or the issue's author move an issue into or out
of a closing column, which closes or reopens it; assignees move cards only
between columns that do the same thing to issues, such as within Done, and
patches never enter a closing one. A move that doesn't cross between open and
closing columns never changes an issue's state.

**A card's state and its placement are stored apart, and the state decides where
it shows.** An issue's state (open, or closed as solved or as other) and a
patch's state (draft, open, merged or archived) live in the issue or patch
itself. They change by its own rules, from this app, the CLI or any other
client. A card's placement, its column and position, lives in the board. The two
are written and replicated separately, so they can disagree: an issue placed in
In Progress may have been closed from the CLI, or a patch placed in In Review
may have been merged. Moving a card writes only its placement, unless the move
crosses between open and closing columns, which also closes or reopens the
issue. When the two disagree, the issue's or patch's state wins over the
placement. The placement is used only while it agrees with the state, and
nothing corrects it, so a card goes back to its placed column once its state
agrees again:

- A closed issue shows where it's placed if that column closes issues for the
  same reason. Otherwise it goes to the first column for its reason, then to any
  closing column, and with no closing column to the first column with a "closed"
  badge.
- An open issue shows where it's placed if that column keeps issues open.
  Otherwise it goes to the first open column, or, if it isn't placed at all, to
  In Review when it has an open linked patch and In Progress when it has a draft
  one.
- A merged patch shows in the first column for solved and an archived one in the
  first column for other, then in any closing column, and with no closing column
  in the first column. A draft or open patch shows where it's placed, or in the
  first open column. Patches are never placed in closing columns.

The app refuses drops that wouldn't show where dropped.

**Patches link to issues with a keyword and a full reference**: `Fixes`,
`Closes` or `Resolves` (or their imperatives, any case, optional colon) before
`rad:<rid>/cob/xyz.radicle.issue/<oid>`, bare or as a Markdown link's target, in
the title or first description. A linked patch shows as a chip on the issue's
card and never changes its state. Priority is the label `priority:<level>`, so
other tools can read it.

**The COB lives in its own crate**, `radicle-board`, depending only on
`radicle`. The type name is `works.monadic.board`; the op manifest carries the
format version, and ops in a newer format are ignored.

**Evaluated boards are cached.** Heartwood caches only its own object types, so
without a cache every read replays every board's history. The app keeps
evaluated boards in `cobs/boards.db` in the profile, next to heartwood's caches.
The cache is:

- **Never stale.** Each row is keyed by the board's tips across all namespaces
  and the format versions. Every read compares them with the references in git,
  so ops the node fetched in the background are picked up on the next read.
- **Exact.** A board's state depends only on its tips, because an op's commit
  has everything it checks (identity document, the card's first op, the proof)
  as parents. A row with matching tips is the board.
- **Rebuilt whole, never patched.** A fetched op can be concurrent with ones
  already applied and sort before them, so a stale board is evaluated again from
  the start.
- **Disposable.** Boards whose references are gone are pruned, our own writes
  store their result, and on any cache error the app evaluates from git.

**Changes are batched and debounced.** Every op is a signed commit that every
peer fetches and keeps, and that every evaluation replays, so one op per drop
would grow the board's history with every small rearrangement, including moves
undone a moment later. The app waits until nothing has changed for 2.5 seconds
and writes all pending changes as one op, dropping changes that cancel out.
Pending changes are written when leaving or switching boards, and on quitting,
which writes without announcing: peers learn of those changes with the
repository's next announcement or when the node restarts.
