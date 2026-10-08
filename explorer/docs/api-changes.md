# httpd API changes

Every breaking change to the httpd API ships in two steps, see [ADR 0001](adr/0001-expand-and-contract-api-changes.md). Expand adds the new shape next to the old one. Contract removes the old one later, on each side separately. This file tracks each change from its expand release until both sides have contracted.

One section per change, under the httpd release that expanded it, newest first. Each section says what the expand added and who reads it, then lists the contract: the code each side removes, and the date it may go. Delete a contract line when its code is gone. Delete the section when its contract list is empty. A release fills its `## API changes` notes from the sections under its heading, and a contract release from every line whose date has passed.

- **Client contract**: the explorer client (`http-client/`) and the Open Graph worker (`workers/open-graph/`) may stop reading the old shape six months after the last httpd release without the new shape.
- **Server contract**: httpd may stop sending the old shape six months after the expand release. Until that release is out, the date is "0.30.0 + 6 months", and the release sets it.

## Expanded in 0.30.0 (unreleased)

### API at `/api`

Expand: httpd serves the API at `/api`, and still serves it at `/api/v1`. Read by the explorer client and the Open Graph worker.

Contract:

- Client, 2027-03-14: switch to `/api` in `http-client/lib/fetcher.ts`
- Client, 2027-03-14: `apiBase` in `workers/open-graph/index.js`
- Client, 2027-03-14: the tests that match `/api/v1` in `tests/visual/desktop/` and `tests/e2e/`
- Server, 0.30.0 + 6 months, after the client lines above: the `/v1` nest in `crates/radicle-httpd/src/api.rs`

### Repo facts outside the project payload

Expand: `cobs`, `releaseCount` and a qualified `defaultBranch` move out of the project payload. The legacy `meta` (counts and `head`) stays inside it. Read by the explorer client and the Open Graph worker.

Contract:

- Client, 2027-03-14: `legacyMetaSchema` and `legacyRepoFields` in `http-client/lib/compat.ts`
- Client, 2027-03-14: `normalizeRepo` in `workers/open-graph/index.js`
- Server, 0.30.0 + 6 months: legacy `meta` and `head` in `crates/radicle-httpd/src/api.rs`

### Release scope

Expand: the releases query takes `scope` (`trusted` or `untrusted`), and the repo reports release buckets. `allAuthors` stays. Read by the explorer client.

Contract:

- Client, 2027-03-14: `legacyReleasesQuery`, `legacyScopeReleases` and `legacyHasOtherReleases` in `http-client/lib/compat.ts`
- Server, 0.30.0 + 6 months: `allAuthors` in `crates/radicle-httpd/src/api/query.rs`

### `releasedAt`

Expand: httpd reports its release date as `releasedAt`, in seconds since the epoch. Explorer warns on nodes past the support window. A missing `releasedAt` counts as 2026-09-14. Read by the explorer client.

Contract:

- Client, 2027-03-14: `legacyReleasedAt` in `http-client/lib/compat.ts`

### Frozen `apiVersion`

Expand: httpd no longer bumps `apiVersion` in the API root, and explorer no longer checks it. It stays at `6.3.0` for older clients. Read by older explorer clients.

Contract:

- Server, 0.30.0 + 6 months: root handler in `crates/radicle-httpd/src/api/v1.rs`
