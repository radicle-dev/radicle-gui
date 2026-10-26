# httpd API changes

Breaking changes to the httpd API that are between expand and contract.
[ADR 0001](adr/0001-expand-and-contract-api-changes.md) has the rules.

- When a change expands, add a section under `## Unreleased`, and add its
  removals to the table.
- When a release ships, build/prepare renames `## Unreleased` to its version.
  When the release bumps the major, add a target date to drop the previous major
  in `## Support`. Its `## API changes` notes come from its sections and from
  the server removals.
- When code is removed, delete its row. When a change has no rows left, delete
  its section.

## Support

Explorer supports httpd 0.28.0 and newer, set by `minimumSupportedVersion` in
`http-client/lib/compat.ts`. No target dates are set yet.

## Removals

| When                      | Side   | Change          | Remove                                                                                                                                                 |
| ------------------------- | ------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Explorer drops httpd 0.26 | Client | Stats endpoints | `getCommitCountBySha` and `getDiffStats` in `http-client/lib/repo.ts`                                                                                  |
| Explorer drops httpd 0.30 | Client | API at `/api`   | `/api/v1` in `http-client/lib/fetcher.ts`, `apiBase` in `workers/open-graph/index.js`, and in the tests under `tests/visual/desktop/` and `tests/e2e/` |
| Explorer drops httpd 0.30 | Client | Repo facts      | `legacyMetaSchema`, `crefsPayloadSchema` and `legacyRepoFields` in `http-client/lib/compat.ts`; `normalizeRepo` in `workers/open-graph/index.js`       |
| Explorer drops httpd 0.30 | Client | Release scope   | `legacyReleasesQuery`, `legacyScopeReleases` and `legacyHasOtherReleases` in `http-client/lib/compat.ts`                                               |
| Explorer drops httpd 0.30 | Client | Release support | `releasesSupported` in `http-client/lib/compat.ts`                                                                                                     |
| Major after client switch | Server | API at `/api`   | The `/v1` nest in `crates/radicle-httpd/src/api.rs`                                                                                                    |
| A major release           | Server | Repo facts      | Legacy `meta` and `head` in `crates/radicle-httpd/src/api.rs`                                                                                          |
| A major release           | Server | Release scope   | `allAuthors` in `crates/radicle-httpd/src/api/query.rs`                                                                                                |

## Unreleased

### API at `/api`

- Added: httpd serves the API at `/api`, and still at `/api/v1`.
- Changed in place: the API root reports `path` as `/api`. The old index at
  `/api`, which only linked to `/v1`, is gone. No client reads either.
- Read by: client, Open Graph worker. Both call `/api/v1` until explorer drops
  httpd 0.30, because older httpd serves only that path. So httpd keeps `/v1`
  until the first major release after they switch.

### Repo facts

- Added: `cobs`, with the release buckets, and a qualified `defaultBranch`,
  outside the project payload. The legacy `meta` (counts and `head`) stays
  inside it.
- Changed in place: `meta.releases` counts `delegate` plus `other`, not every
  release object. When httpd cannot count, it leaves the field out instead of
  sending 0. Older clients parse both, because the field was always optional.
- Changed in place: only `repos/:rid` sends the release buckets and
  `meta.releases`. Repo lists leave both out, because counting reads every
  release of each repo.
- Read by: client, Open Graph worker.

### Release scope

- Added: the releases query takes `scope` (`trusted` or `untrusted`).
  `allAuthors` stays.
- Read by: client.

### Release support

- Added: `/info` reports `httpd.releases`, whether httpd was built with release
  support. Without it, a repo with no release count could be a node without
  releases or a count that failed.
- Read by: client. On older httpd, it reads a release count as support.

### Version

- Removed: `apiVersion` in the API root. The client no longer checks it, and
  released clients do not read it.
- Added: the client reads `version` in the API root, and warns on nodes older
  than `minimumSupportedVersion`.
- This is a removal, so the release bumps the major.

## 0.27.0

### Stats endpoints

- Added: `stats/commits/:sha` and `diff/:base/:oid/stats`. The client falls back
  to the tree stats and the full diff.
- Read by: client.
