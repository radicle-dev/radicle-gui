# 1. Expand and contract httpd API changes

Date: 2026-10-20

## Status

Accepted

## Context

Explorer is deployed continuously, and the public instance at radicle.network
always runs the latest version. The seeds it reads (httpd instances) upgrade on
their own schedule, so explorer often reads an older httpd. A change to a
response can break explorer on those seeds, and the operator of a seed cannot
tell why their node no longer loads.

## Decision

**One version.** httpd uses semantic versions. The version covers the HTTP API,
the CLI and the config. A minor release adds, and a major release removes or
changes. Before 1.0, `0.y` counts as the major, as in Cargo: a release that only
adds bumps `0.y.z` to `0.y.(z+1)`, and a release that removes or changes bumps
it to `0.(y+1).0`.

**Supported releases.** Explorer supports every httpd release from
`minimumSupportedVersion` in `http-client/lib/compat.ts` up to the latest. This
can span more than two majors, because before 1.0 each `0.y` is a major.
Explorer warns about a node older than that. It does not warn about a version
that it cannot parse, such as `pre-release` or `nix-<commit>`. httpd does not
warn its operator at startup: it cannot know the floor of the explorer that
reads it.

**The 3-month guideline.** Explorer aims to support a major for at least three
months after the next major replaces it. The release that bumps the major writes
this target date in `docs/api-changes.md`, the only place that holds dates. When
the date comes, check which versions the seeds run, then raise
`minimumSupportedVersion` or move the date. You may raise it sooner, when few
seeds still run that major or when a fix needs it.

**Expand, then contract.** A breaking change ships in two steps:

1. Expand, in a minor release: httpd adds the new fields next to the old ones,
   and keeps the old ones exactly as they were. The client reads the new fields
   and falls back to the old ones.
2. Contract, in a later major release: httpd removes the old fields. It may not
   remove a field or path that the explorer client or the Open Graph worker
   (`workers/open-graph`) still reads.

A security fix is the one exception: it may narrow an existing field in place,
for example to stop it from sending data that an attacker can write. It must
keep the field's type, so that older clients still parse it. Its release notes
say which field changed and why.

**One place for compatibility code.** The client turns the responses of every
supported httpd release into one shape. Version-specific code lives in
`http-client/lib/compat.ts`. A fallback to an older endpoint stays in the client
method that calls that endpoint.

**Name the side and the version in every removal.** httpd and the client remove
their compatibility code at different times:

- httpd stops sending the old fields in a major release after the expand.
- The client keeps its fallback until explorer drops the last httpd release
  without the new fields.

So each removal comment says which side it is on, and when it can go:

```rust
// Compat: older clients ... Server: remove in a major release.
```

```ts
// Compat: older httpd ... Client: remove when explorer drops httpd 0.30.
```

**Track every change in one place.** `docs/api-changes.md` lists each change
with its expand release, the consumers that read it, and its pending removals. A
release fills its `## API changes` notes from this list.

**Feature detection, not version checks.** The client learns what a seed
supports from its responses: a field that is present, or an endpoint that
answers. It never branches on the httpd version, and uses that version only to
warn about an unsupported node.

**No version but httpd's.** httpd does not report `apiVersion`, and serves the
API at `/api`, with no version in the path. When a path moves, the client cannot
tell from a response which path a seed has. So it keeps the old path until
explorer drops the last httpd release without the new one, and httpd serves the
old path until the first major release after that.

## Forward compatibility

Explorer does not support httpd releases that are newer than itself, and it does
not need to. Explorer and httpd live in one repository, and a patch that changes
the API also updates the client. radicle.network deploys explorer continuously,
so it is not older than a released httpd. A self-hosted explorer should track
the latest version for the same reason.
