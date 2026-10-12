use std::collections::BTreeSet;

use radicle::identity::Did;
use radicle::storage::ReadStorage;
use radicle::{git, identity};

use radicle_artifact::trust::{Scope, Trust};
use radicle_artifact::{Filters, ReleaseId, Releases as ArtifactStore, cache_db_path};

use crate::cobs;
pub use crate::cobs::release::{ReleaseFilter, ReleaseScope};
use crate::error::Error;
use crate::traits::Profile;

impl ReleaseFilter {
    /// The crate's visibility rules for this view. No local user is trusted,
    /// so the default view matches the `delegate` bucket of `counts()`.
    fn filters(self, delegates: &BTreeSet<Did>) -> Filters<'_> {
        Filters {
            trust: Trust::new(delegates, None),
            scope: match self.scope {
                ReleaseScope::Trusted => Scope::Trusted,
                ReleaseScope::Untrusted => Scope::Untrusted,
            },
            include_redacted: self.show_redacted,
        }
    }
}

pub trait Releases: Profile {
    /// List a repository's releases, newest first.
    ///
    /// Scoped to releases created by a delegate and artifacts authored by a
    /// delegate, or with an untrusted `filter` to those by non-delegates, so
    /// the two scopes never overlap. Artifacts redacted by a trusted party are
    /// hidden unless `filter` shows them. A release with no artifact in scope
    /// shows every author's. A release whose artifacts were all redacted is
    /// hidden with them; a release with no artifacts is shown. This is the view
    /// `rad-artifact list` gives. Without `take` the full list is returned and
    /// `skip` is ignored.
    fn list_releases(
        &self,
        rid: identity::RepoId,
        filter: Option<ReleaseFilter>,
        skip: Option<usize>,
        take: Option<usize>,
    ) -> Result<cobs::PaginatedQuery<Vec<cobs::release::Release>>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let aliases = profile.aliases();
        let filter = filter.unwrap_or_default();

        // Read through the SQLite cache; it self-warms on read and is shared
        // with other release reads on this node. `list` is sorted newest
        // first and lazy, so a page reads only the rows up to its end.
        let store = ArtifactStore::open_cached(&repo, cache_db_path(profile.cobs()))?;
        let filters = filter.filters(store.delegates());
        let releases = store
            .list()?
            .filter_map(Result::ok)
            .filter(|(_, release)| filters.shows_release(release));

        // With no artifact by an author in scope, fall back to every author, as
        // the release page does, so a teaser never counts fewer artifacts than
        // its page lists. A redacted artifact in scope keeps the scope.
        let fallback = Filters {
            scope: Scope::All,
            ..filters
        };
        let summary = |(id, release): (radicle::cob::ObjectId, radicle_artifact::Release)| {
            let has_trusted = release
                .artifacts()
                .values()
                .any(|artifact| filters.trust.admits(filters.scope, artifact.author()));
            let artifacts = if has_trusted { filters } else { fallback }
                .artifacts(&release)
                .map(|(cid, artifact)| {
                    cobs::release::Artifact::new(cid, artifact, store.delegates(), &aliases)
                })
                .collect::<Vec<_>>();

            cobs::release::Release::new(ReleaseId::from(id), &release, &repo, &aliases, artifacts)
        };

        match take {
            None => Ok(cobs::PaginatedQuery {
                cursor: 0,
                more: false,
                content: releases.map(summary).collect::<Vec<_>>(),
            }),
            Some(take) => {
                let cursor = skip.unwrap_or(0);
                let mut content = releases
                    .skip(cursor)
                    .take(take + 1)
                    .map(summary)
                    .collect::<Vec<_>>();
                let more = content.len() > take;
                content.truncate(take);

                Ok(cobs::PaginatedQuery {
                    cursor,
                    more,
                    content,
                })
            }
        }
    }

    /// Get a single release by id, with all of its artifacts. Filtering is left
    /// to the caller so a release reached by a direct link is never empty.
    fn release_by_id(
        &self,
        rid: identity::RepoId,
        id: git::Oid,
    ) -> Result<Option<cobs::release::Release>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let aliases = profile.aliases();

        let store = ArtifactStore::open_cached(&repo, cache_db_path(profile.cobs()))?;
        let release = store.get(&ReleaseId::from(id))?;

        Ok(release.map(|release| {
            let artifacts = release
                .artifacts()
                .iter()
                .map(|(cid, artifact)| {
                    cobs::release::Artifact::new(cid, artifact, store.delegates(), &aliases)
                })
                .collect::<Vec<_>>();

            cobs::release::Release::new(ReleaseId::from(id), &release, &repo, &aliases, artifacts)
        }))
    }

    /// Number of releases in a repository, bucketed the same way the default
    /// list filters them.
    fn release_counts(&self, rid: identity::RepoId) -> Result<cobs::release::ReleaseCounts, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let store = ArtifactStore::open_cached(&repo, cache_db_path(profile.cobs()))?;

        Ok(store.counts()?.into())
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use std::str::FromStr;

    use radicle::crypto::{Seed, SigningKey};
    use radicle::storage::ReadStorage;
    use radicle::test::fixtures;

    use radicle_artifact::{Cid, Releases as ArtifactStore};

    use super::Releases;
    use crate::cobs::release::{ReleaseFilter, ReleaseScope};
    use crate::{AppState, test};

    const CID: &str = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const OTHER_CID: &str = "bafkr4ihjtgc6jaulcccny3jhc3ezxfjdgnp4vvt23nf6qqlrhpk764ufbu";

    /// Count the artifacts the default list shows for a delegate release
    /// holding one non-delegate artifact, after `setup` adds to it.
    fn listed_artifacts(
        setup: impl FnOnce(
            &mut radicle_artifact::ReleaseMut<'_, '_, radicle::storage::git::Repository>,
            &SigningKey,
        ),
    ) -> usize {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(&tmp.path().join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let other = SigningKey::from_seed(Seed::new([0xee; 32]));
        let (rid, _, _, head) =
            fixtures::project(tmp.path().join("project"), &profile.storage, &signer).unwrap();
        {
            let repo = profile.storage.repository(rid).unwrap();
            let mut releases = ArtifactStore::open(&repo).unwrap();
            let mut release = releases
                .create(radicle::git::Oid::from(head), None, &signer)
                .unwrap();
            release
                .register_artifact(Cid::from_str(OTHER_CID).unwrap(), "eve".into(), &other)
                .unwrap();
            setup(&mut release, &signer);
        }

        let state = AppState { profile };
        let list = state.list_releases(rid, None, None, None).unwrap();
        list.content[0].artifacts.len()
    }

    #[test]
    fn list_falls_back_to_every_author_without_delegate_artifact() {
        assert_eq!(listed_artifacts(|_, _| {}), 1);
    }

    #[test]
    fn list_keeps_delegate_scope_with_redacted_delegate_artifact() {
        let count = listed_artifacts(|release, signer| {
            let cid = Cid::from_str(CID).unwrap();
            release
                .register_artifact(cid, "bin".into(), signer)
                .unwrap();
            release.redact(cid, "bad build".into(), signer).unwrap();
        });
        assert_eq!(count, 0);
    }

    #[test]
    fn list_pages_through_releases() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(&tmp.path().join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let (rid, _, _, head) =
            fixtures::project(tmp.path().join("project"), &profile.storage, &signer).unwrap();
        {
            let repo = profile.storage.repository(rid).unwrap();
            let mut releases = ArtifactStore::open(&repo).unwrap();
            for seed in [0xaa, 0xbb, 0xcc] {
                let other = SigningKey::from_seed(Seed::new([seed; 32]));
                releases
                    .create(radicle::git::Oid::from(head), None, &other)
                    .unwrap();
            }
        }
        let state = AppState { profile };
        let filter = ReleaseFilter {
            scope: ReleaseScope::Untrusted,
            show_redacted: false,
        };
        let page = |skip, take| state.list_releases(rid, Some(filter), skip, take).unwrap();

        let all = page(None, None);
        assert_eq!((all.content.len(), all.more), (3, false));

        let first = page(Some(0), Some(2));
        let second = page(Some(2), Some(2));
        assert_eq!((first.cursor, first.more), (0, true));
        assert_eq!((second.cursor, second.more), (2, false));
        let ids = |pages: &[&[crate::cobs::release::Release]]| {
            pages
                .iter()
                .flat_map(|p| p.iter().map(|r| r.id))
                .collect::<Vec<_>>()
        };
        assert_eq!(
            ids(&[&first.content, &second.content]),
            ids(&[&all.content])
        );

        let exact = page(Some(0), Some(3));
        assert_eq!((exact.content.len(), exact.more), (3, false));
    }

    #[test]
    fn list_scopes_split_delegates_from_others() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(&tmp.path().join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let other = SigningKey::from_seed(Seed::new([0xee; 32]));
        let (rid, _, _, head) =
            fixtures::project(tmp.path().join("project"), &profile.storage, &signer).unwrap();
        let (ours, theirs) = {
            let repo = profile.storage.repository(rid).unwrap();
            let mut releases = ArtifactStore::open(&repo).unwrap();
            let oid = radicle::git::Oid::from(head);
            let ours = releases.create(oid, None, &signer).unwrap().id().oid();
            let theirs = releases.create(oid, None, &other).unwrap().id().oid();
            (ours, theirs)
        };

        let state = AppState { profile };
        let listed = |scope| {
            let filter = ReleaseFilter {
                scope,
                show_redacted: false,
            };
            state
                .list_releases(rid, Some(filter), None, None)
                .unwrap()
                .content
                .into_iter()
                .map(|r| r.id)
                .collect::<Vec<_>>()
        };

        assert_eq!(listed(ReleaseScope::Trusted), [ours]);
        assert_eq!(listed(ReleaseScope::Untrusted), [theirs]);
    }

    #[test]
    fn release_counts_split_delegates_from_others() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(&tmp.path().join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let other = SigningKey::from_seed(Seed::new([0xee; 32]));
        let (rid, _, _, head) =
            fixtures::project(tmp.path().join("project"), &profile.storage, &signer).unwrap();
        {
            let repo = profile.storage.repository(rid).unwrap();
            let mut releases = ArtifactStore::open(&repo).unwrap();
            let oid = radicle::git::Oid::from(head);
            releases.create(oid, None, &signer).unwrap();
            let mut theirs = releases.create(oid, None, &other).unwrap();
            let cid = Cid::from_str(OTHER_CID).unwrap();
            theirs.register_artifact(cid, "eve".into(), &other).unwrap();
            theirs.redact(cid, "oops".into(), &other).unwrap();
        }

        let counts = AppState { profile }.release_counts(rid).unwrap();
        assert_eq!(
            (
                counts.delegate,
                counts.delegate_redacted,
                counts.other,
                counts.other_redacted
            ),
            (1, 0, 0, 1)
        );
    }
}
