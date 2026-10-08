# Change the httpd API with expand and contract

## Context

One codebase uses the httpd API, but it runs as many independent frontends. Each one upgrades on its own schedule. The seed picker lets any frontend query any seed, so a frontend deployed a year ago often talks to a current httpd. We cannot assume a frontend and the httpd it queries shipped together.

Compatibility goes in two directions:

- **Backward compatibility:** a current frontend talks to an older httpd. The frontend must handle older responses.
- **Forward compatibility:** an older frontend talks to a newer httpd. httpd must not break the frontend without notice.

Frontends parse responses with Zod schemas. This sets what a change can break:

- Zod strips unknown keys by default, so older frontends ignore new fields.
- A missing required field fails the parse with `ResponseParseError`.
- A list parses as one array, so one bad item fails the whole page.

## Decision

We make breaking API changes in two phases: expand, then contract.

### Expand

httpd adds the new shape next to the old one:

- Add new fields. Do not rename, remove, or change the shape of old fields.
- Keep the rules of the old fields exactly. If httpd cannot fill an old field completely, it does what it did before the change. A partial old field would fail older frontends.
- Mark each old field as deprecated in the code. Give the httpd version that removes it and link to this ADR.

The frontend reads the new shape and falls back to the old one:

- Treat new fields as optional, because older nodes do not send them.
- Treat deprecated fields as optional too. Fall back to them, but never require them. Otherwise the contract breaks frontends that already read the new shape.
- Do the fallback in the client schema (a Zod `transform`), so views read only one shape.

### Contract

A named httpd release removes the old fields. That version number is the notice. Frontends that have not upgraded by then break against upgraded seeds. This is the planned cost of the change. The client drops its fallbacks with the same release.

### Rules

- Every deprecation has a removal version. A deprecation without a date never ends.
- Never deprecate delegate-signed data in `payloads`. Only fields that httpd computes can be removed.
- Never fill a missing value with a default, such as a count of zero. A missing value means "this node cannot tell you". Zero is a claim.

## Considered options

- **Break at once.** Rejected. Every frontend not upgraded at the same time would break without warning.
- **Keep both shapes forever.** Rejected. The old shape often cannot express the cases that cause the change, so code that reads it gets worse over time. The duplicate fields also stay in every response.

## Limits

- Expand keeps what older frontends could already do. It does not give them what the change adds.
- Nothing warns operators before a contract. `requiredApiVersion` does not help: it gates nothing, only words an error message after a parse fails, and is stale (`~0.18.0` against httpd 0.28.0). Until it is fixed, this ADR and the release notes are the only notice.

## Consequences

- During expand, responses carry the same data twice.
- The release notes for a contract release must list every field it removes.

## Uses

| Change | Expand | Contract |
| --- | --- | --- |
| Repo counts and default branch move from `payloads["xyz.radicle.project"].meta` to top-level `cobs` and `defaultBranch` | 0.28.x to 0.29.x | 0.30.0 |

## Exceptions

An exception breaks an API at once, without an expand phase. Record each one here with its reason.

| Change | Breaks in | Reason |
| --- | --- | --- |
| `meta.releases` in the project payload changes from a number to the bucket object in `cobs.releases`. The `allAuthors` query on `/repos/{rid}/releases` is removed and httpd ignores it. | 0.29.0 | The releases API shipped in 0.28.0, and frontends that read it were deployed only a few weeks before. We redeploy them with this release, so a short break costs less than an expand phase. |

Effects on a frontend older than 0.29.0 that queries an httpd at 0.29.0 or later:

- The repo parse fails, because the frontend reads `meta.releases` as a number. Repo pages and repo lists do not load.
- "All" on the releases page shows only delegate releases, because httpd ignores `allAuthors`.
