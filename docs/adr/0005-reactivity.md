# 5. Data access and reactivity

Date: 2026-10-28

## Status

Accepted

## Context

Each app fetches its data in its own way, and only desktop caches some of it,
through the shared `cached()` helper; explorer has its own copy. Neither
reacts to changes in its backend's data: desktop's backend emits only node
status and download progress, its repository list polls while replication is
pending, and radicle-httpd has no push API.

Both apps should react to such changes, desktop first, without disturbing the
user. Lists and counts can refresh in place, but a revision or diff under
review must stay as it is, showing that newer data is available until the
user applies it.

radicle-upstream, an earlier Radicle app, refetched whole screens on every
change event. Updates reset the user's selection, screens refetched the same
data twice, and events were lost when its stream dropped.

We also considered events that carry the new data, which ties them to each
transport's response shapes; a cache of our own on Svelte stores, which would
have to rebuild deduplication, retries and structural sharing; and polling in
explorer, which loads the third-party nodes it browses for little gain in a
read-only view.

## Decision

- Core defines the keys of the data shared code reads, by domain identity and
  nested under the repository, so that one prefix covers all of a
  repository's data. Each app supplies the fetchers for them, shaped after
  desktop's finer reads. Writes are separate, and only desktop has them for
  now.
- A shared query cache on TanStack Query keeps the results, deduplicates reads
  and applies writes. It lives in `@radicle-gui/ui` and is used by the apps'
  views. Shared components never import it, enforced by lint, and keep taking
  props.
- Route loaders load through the cache and views read from it, so that a
  view's first data is already cached. Paginated lists keep their pages in
  the cache too.
- Data keyed by an oid, such as commits, trees, blobs and diffs, never changes,
  so it is cached without expiry and never invalidated.
- Each app forwards its backend's ref updates: the repository and the names of
  the refs that changed. A pure function in core maps them to the keys they
  affect, which the cache invalidates and refetches while they are shown.
- Refetched data keeps the identity of objects that didn't change, so only
  what changed re-renders and a view can tell newer data by reference.
- A view whose content the user is acting on, such as a revision under review,
  renders a pinned snapshot and shows that newer data is available when the
  cache's data is a different object.
- Desktop's backend forwards its node's fetch events. Local announcements,
  such as a push from the terminal, name no refs and invalidate the whole
  repository. When events may have been missed, such as after the node
  restarts, everything shown is invalidated.
- Explorer has no event source until radicle-httpd can push ref updates. It
  refetches mutable data on navigation and when the window regains focus, and
  so does desktop while its node is stopped.

## Consequences

- Each piece of data is fetched once and refetched only when it changed, and
  updates no longer reset what the user is doing.
- Both apps depend on TanStack Query, which replaces `cached()` and explorer's
  copy of it. Events replace desktop's polling of its repository list.
- Desktop's backend has to subscribe to its node's events.
- Explorer views move to runes before they use the cache.
- The rule in `shared/ui/AGENTS.md` that components keep their local state
  when props change becomes essential.

## Open questions

- Whether httpd grows finer endpoints that match desktop's reads, such as
  COB timelines, and a push API for ref updates.
