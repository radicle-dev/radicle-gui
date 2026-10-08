# httpd API changes

Every breaking change to the httpd API ships in two steps, see
[ADR 0001](adr/0001-expand-and-contract-api-changes.md). Expand adds the new
shape next to the old one. Contract removes the old one later, on each side
separately. This file tracks each change from its expand release until both
sides have contracted.

One section per change, under the httpd release that expanded it, newest first.
Each section says what the expand added and who reads it, then lists the
contract: the code each side removes, and when it may go. Delete a contract line
when its code is gone. Delete the section when its contract list is empty. A
release fills its `## API changes` notes from the sections under its heading,
and a major release from every server line.

- **Client contract**: the explorer client (`http-client/`) and the Open Graph
  worker (`workers/open-graph/`) may stop reading the old shape when explorer
  drops the last httpd release without the new shape.
- **Server contract**: httpd may stop sending the old shape in a major release
  after the expand.

## Expanded in the next release (unreleased)

### API at `/api`

Expand: httpd serves the API at `/api`, and still serves it at `/api/v1`. Read
by the explorer client and the Open Graph worker.

Contract:

- Client, when explorer drops httpd 0.30: switch to `/api` in
  `http-client/lib/fetcher.ts`
- Client, when explorer drops httpd 0.30: `apiBase` in
  `workers/open-graph/index.js`
- Client, when explorer drops httpd 0.30: the tests that match `/api/v1` in
  `tests/visual/desktop/` and `tests/e2e/`
- Server, a major release after the client lines above: the `/v1` nest in
  `crates/radicle-httpd/src/api.rs`

### Repo facts outside the project payload

Expand: `cobs`, `releaseCount` and a qualified `defaultBranch` move out of the
project payload. The legacy `meta` (counts and `head`) stays inside it. Read by
the explorer client and the Open Graph worker.

Contract:

- Client, when explorer drops httpd 0.30: `legacyMetaSchema` and
  `legacyRepoFields` in `http-client/lib/compat.ts`
- Client, when explorer drops httpd 0.30: `normalizeRepo` in
  `workers/open-graph/index.js`
- Server, a major release: legacy `meta` and `head` in
  `crates/radicle-httpd/src/api.rs`

### Release scope

Expand: the releases query takes `scope` (`trusted` or `untrusted`), and the
repo reports release buckets. `allAuthors` stays. Read by the explorer client.

Contract:

- Client, when explorer drops httpd 0.30: `legacyReleasesQuery`,
  `legacyScopeReleases` and `legacyHasOtherReleases` in
  `http-client/lib/compat.ts`
- Server, a major release: `allAuthors` in
  `crates/radicle-httpd/src/api/query.rs`

### Removed `apiVersion`

httpd no longer reports `apiVersion` in the API root, and explorer no longer
checks it. Explorer warns on nodes older than `minimumSupportedVersion` in
`http-client/lib/compat.ts`, from the `version` in the API root. Released
explorers do not read `apiVersion`. This is a removal, so the next release is a
major release.
