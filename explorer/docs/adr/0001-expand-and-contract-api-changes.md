# 1. Expand and contract httpd API changes

Date: 2026-10-20

## Status

Accepted

## Context

Many explorer deployments read from many seeds, and each one upgrades on
its own schedule. A current explorer often reads an older httpd, and an
older explorer often reads a current one. A change to a response can break
either side, and the operator of a seed cannot tell why their node no
longer loads.

## Decision

**Support window.** Explorer supports an httpd release for six months
after its release date, and always while it is the latest release. A
count of releases would not work: a quick hotfix would shorten the window,
and explorer has no versions of its own. A seed that runs an older
release may not load. The README says this, so that operators can find it.

**Expand, then contract.** A breaking change ships in two steps:

1. Expand: httpd adds the new fields next to the old ones, and keeps the
   old ones exactly as they were. The client reads the new fields and
   falls back to the old ones.
2. Contract: a release at least six months after the expand removes the
   old fields. Its release notes list every field it removes. It may not
   remove a field or path that the explorer client or the Open Graph
   worker (`workers/open-graph`) still reads.

A security fix is the one exception: it may narrow an existing field in
place, for example to stop it from sending data that an attacker can
write. It must keep the field's type, so that older clients still parse
it. Its release notes say which field changed and why.

**One place for compatibility code.** The client turns the responses of
every supported httpd release into one shape, so views and components
never check versions. Version-specific code lives in
`http-client/lib/compat.ts`. A fallback to an older endpoint stays in the
client method that calls that endpoint. Each shim has a comment that says
what older httpd does and the date when the shim goes.

**Name the side and the date in every removal.** httpd and the client
remove their compatibility code at different times:

- httpd stops sending the old fields six months after the expand release.
- The client keeps its fallback until the last httpd release without the
  new fields leaves the support window: six months after that release, or
  after the next release if that comes later.

So each removal comment says which side it is on, and names a date, not a
version. The support window counts in dates, so a date is all a reader
needs to know whether the code can go:

```rust
// Compat: older clients ... Server: remove after 2027-05-01.
```

```ts
// Compat: older httpd ... Client: remove after 2027-03-14.
```

Before the expand release is out, its server date is not known yet. The
comment then says "Server: remove 6 months after release", and the release
sets it to a date.

**Track every change in one place.** `docs/api-changes.md` lists each
change with its expand release and the consumers that read it, and each
pending removal by date. A release fills its
`## API changes` notes from this list.

**Capabilities, not versions.** The client finds out what a seed supports
from the response itself: a field that is present, or an endpoint that
answers. Endpoints do not carry their own version numbers.

**No version checks.** The client no longer checks the `apiVersion` that a
node reports against a required range, and httpd no longer bumps it. The
field stays, frozen, until older clients are out of the window. A node
reports `releasedAt`, the release date of its build in seconds since the
epoch. Explorer uses it to warn the visitors of an outdated node, and
httpd uses it to warn its operator at startup.

**Versioning.** Every httpd release bumps the minor version, and a hotfix
bumps the patch version. A version names a release; it is not a promise
about compatibility. The dates above are.

**One API path.** httpd serves the API at `/api`. The `/v1` in the old
`/api/v1` suggested a versioned API that we do not have. httpd still
serves the same API at `/api/v1`, so that older clients keep working. It
does not redirect: browsers cache a permanent redirect, which breaks a
node that rolls back, and any redirect adds a round trip to every request.
The client and the Open Graph worker move to `/api` once every supported
node serves it.

**Missing is not zero.** httpd leaves out a value that it cannot
determine. It never sends a default in its place, such as a count of zero.
