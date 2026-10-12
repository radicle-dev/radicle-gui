use std::path::PathBuf;
use std::str::FromStr;

use radicle::identity::{self, Did};
use radicle::profile::Signer;
use radicle::storage::ReadStorage;
use radicle::storage::git::Repository;
use url::Url;

use radicle_artifact::{Cid, ReleaseId, ReleaseMut, Releases as ArtifactStore};
use radicle_artifact_core::cid as cid_utils;
use radicle_artifact_core::keys::EndpointId;

use crate::cobs;
use crate::error::Error;
use crate::traits::Profile;
use crate::traits::release::Releases;

/// Parse a content id, folding the multiformats parse error into our own so
/// the rest of the app need not depend on the `cid` crate.
pub(crate) fn parse_cid(cid: &str) -> Result<Cid, Error> {
    Cid::from_str(cid).map_err(|err| radicle_artifact_core::Error::Cid(err.to_string()).into())
}

/// Parse a location URL, rejecting ones peers could not fetch from, as
/// `rad-artifact location add` does, so they are never signed into the COB.
fn parse_location(url: &str) -> Result<Url, Error> {
    let url = Url::parse(url.trim()).map_err(|err| Error::InvalidLocation(err.to_string()))?;
    if EndpointId::is_legacy_endpoint_url(&url) {
        return Err(Error::InvalidLocation(
            "the `iroh://` scheme was renamed to `radiroh://`".into(),
        ));
    }
    if EndpointId::is_endpoint_url(&url) {
        EndpointId::from_url(&url).map_err(|err| Error::InvalidLocation(err.to_string()))?;
    }

    Ok(url)
}

/// Open a release for writing and apply `f` to the artifact `cid` on it,
/// signed by the local user.
fn update_artifact(
    ctx: &(impl Profile + ?Sized),
    rid: identity::RepoId,
    release_id: &str,
    cid: &str,
    f: impl FnOnce(&mut ReleaseMut<'_, '_, Repository>, Cid, &Signer) -> Result<(), Error>,
) -> Result<(), Error> {
    let profile = ctx.profile();
    let signer = profile.signer()?;
    let repo = profile.storage.repository(rid)?;

    let id = ReleaseId::from_str(release_id)?;
    let cid = parse_cid(cid)?;

    let mut releases = ArtifactStore::open(&repo)?;
    let mut release = releases.get_mut(&id)?;
    f(&mut release, cid, &signer)
}

pub trait ReleasesMut: Releases {
    /// Content-address a file or directory on disk without involving the
    /// artifact node, so a release can be assembled while the node is down.
    ///
    /// Files hash as a single blob; directories hash as a collection over a
    /// canonical walk. The size is returned alongside so the caller can
    /// register the artifact and its size hint in one signed entry.
    fn compute_artifact_cid(&self, path: PathBuf) -> Result<cobs::release::ArtifactDigest, Error> {
        let directory = path.is_dir();
        let cid = if directory {
            cid_utils::compute_content_id(&path)?
        } else {
            cid_utils::compute_blob_cid(&path)?
        };
        let file_count = if directory {
            cid_utils::canonical_walk(&path)?.len() as u64
        } else {
            1
        };

        Ok(cobs::release::ArtifactDigest {
            cid: cid.to_string(),
            size_bytes: cid_utils::compute_size_from_path(&path)?,
            file_count,
            directory,
        })
    }

    /// Find the release for a commit, or create one. Returns the release id.
    ///
    /// Idempotent: re-running against the same commit reuses the existing
    /// release rather than creating a second one. As with `rad-artifact
    /// release create`, only a release the local user created is reused, so
    /// artifacts never land under another peer's release. With `tag`, only a
    /// release carrying that exact tag is reused; without it, the newest one
    /// for the commit is. Pass `None` for lightweight tags and bare commits,
    /// since the store accepts only an annotated tag that peels to `oid`.
    fn create_or_open_release(
        &self,
        rid: identity::RepoId,
        oid: radicle::git::Oid,
        tag: Option<radicle::git::Oid>,
    ) -> Result<String, Error> {
        let profile = self.profile();
        let signer = profile.signer()?;
        let repo = profile.storage.repository(rid)?;

        if repo.backend.find_commit(oid.into()).is_err() {
            return Err(Error::CommitNotFound(oid));
        }

        let local = Did::from(profile.public_key);

        let mut releases = ArtifactStore::open(&repo)?;

        let existing = releases
            .find_by_commit(oid)?
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .filter(|(_, release)| {
                release.creator() == &local && tag.is_none_or(|tag| release.tag() == Some(&tag))
            })
            .max_by_key(|(_, release)| release.timestamp())
            .map(|(id, _)| id);

        let id = match existing {
            Some(id) => id,
            None => *releases.create(oid, tag, &signer)?.id(),
        };

        Ok(id.to_string())
    }

    /// Register an artifact under a release, recording its size hint in the
    /// same signed entry.
    fn register_artifact(
        &self,
        rid: identity::RepoId,
        release_id: String,
        cid: String,
        name: String,
        size_bytes: u64,
    ) -> Result<(), Error> {
        update_artifact(self, rid, &release_id, &cid, |release, cid, signer| {
            release.register_artifact_with_size(cid, name, size_bytes, signer)?;
            Ok(())
        })
    }

    /// Announce a place an artifact can be fetched from.
    fn add_location(
        &self,
        rid: identity::RepoId,
        release_id: String,
        cid: String,
        url: String,
    ) -> Result<(), Error> {
        let url = parse_location(&url)?;
        update_artifact(self, rid, &release_id, &cid, |release, cid, signer| {
            release.add_location(cid, url, signer)?;
            Ok(())
        })
    }

    /// Withdraw a location this node previously announced.
    fn remove_location(
        &self,
        rid: identity::RepoId,
        release_id: String,
        cid: String,
        url: String,
    ) -> Result<(), Error> {
        let url = Url::parse(&url)?;
        update_artifact(self, rid, &release_id, &cid, |release, cid, signer| {
            release.remove_location(cid, url, signer)?;
            Ok(())
        })
    }

    /// Vouch for an artifact by reproducing it: hash a local build at `path`
    /// and sign an attestation only when it arrives at the same content id.
    fn attest_artifact(
        &self,
        rid: identity::RepoId,
        release_id: String,
        cid: String,
        path: PathBuf,
    ) -> Result<(), Error> {
        let expected = parse_cid(&cid)?;
        let actual = parse_cid(&self.compute_artifact_cid(path)?.cid)?;
        if actual != expected {
            return Err(radicle_artifact_core::Error::CidMismatch {
                expected: expected.to_string(),
                actual: actual.to_string(),
            }
            .into());
        }

        update_artifact(self, rid, &release_id, &cid, |release, cid, signer| {
            release.attest(cid, signer)?;
            Ok(())
        })
    }

    /// Set a free-form metadata key on an artifact.
    fn set_artifact_metadata(
        &self,
        rid: identity::RepoId,
        release_id: String,
        cid: String,
        key: String,
        value: serde_json::Value,
    ) -> Result<(), Error> {
        update_artifact(self, rid, &release_id, &cid, |release, cid, signer| {
            release.set_metadata(cid, key, value, signer)?;
            Ok(())
        })
    }

    /// Remove a metadata key from an artifact.
    fn remove_artifact_metadata(
        &self,
        rid: identity::RepoId,
        release_id: String,
        cid: String,
        key: String,
    ) -> Result<(), Error> {
        update_artifact(self, rid, &release_id, &cid, |release, cid, signer| {
            release.remove_metadata(cid, key, signer)?;
            Ok(())
        })
    }

    /// Flag an artifact as one that should no longer be fetched.
    fn redact_artifact(
        &self,
        rid: identity::RepoId,
        release_id: String,
        cid: String,
        reason: String,
    ) -> Result<(), Error> {
        update_artifact(self, rid, &release_id, &cid, |release, cid, signer| {
            release.redact(cid, reason, signer)?;
            Ok(())
        })
    }

    /// Remove the local user's ref to a release.
    ///
    /// The release disappears once no peer has a ref to it. Actions other
    /// peers built on stay visible, so a release others added to remains.
    fn delete_release(&self, rid: identity::RepoId, release_id: String) -> Result<(), Error> {
        let profile = self.profile();
        let signer = profile.signer()?;
        let repo = profile.storage.repository(rid)?;

        let id = ReleaseId::from_str(&release_id)?;

        let mut releases = ArtifactStore::open(&repo)?;
        releases.remove(&id, &signer)?;

        Ok(())
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
pub(crate) mod test {
    use std::str::FromStr;

    use radicle::crypto::{Seed, Signer, SigningKey};
    use radicle::identity::RepoId;
    use radicle::storage::ReadStorage;
    use radicle::test::fixtures;

    use radicle_artifact::Releases as ArtifactStore;

    use super::ReleasesMut;
    use crate::cobs::release::Release;
    use crate::traits::release::Releases;
    use crate::{AppState, test};

    #[test]
    fn create_or_open_release_skips_other_creators() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(&tmp.path().join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let (rid, _, _, head) =
            fixtures::project(tmp.path().join("project"), &profile.storage, &signer).unwrap();
        let oid = radicle::git::Oid::from(head);

        // Another peer releases the same commit first.
        let other = SigningKey::from_seed(Seed::new([0xee; 32]));
        let repo = profile.storage.repository(rid).unwrap();
        let theirs = *ArtifactStore::open(&repo)
            .unwrap()
            .create(oid, None, &other)
            .unwrap()
            .id();

        let state = AppState { profile };
        let ours = state.create_or_open_release(rid, oid, None).unwrap();

        assert_ne!(ours, theirs.to_string());
        assert_eq!(state.create_or_open_release(rid, oid, None).unwrap(), ours);
    }

    #[test]
    fn create_or_open_release_rejects_unknown_commit() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(&tmp.path().join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let (rid, _, _, _) =
            fixtures::project(tmp.path().join("project"), &profile.storage, &signer).unwrap();
        let unknown =
            radicle::git::Oid::from_str("cafecafecafecafecafecafecafecafecafecafe").unwrap();

        let state = AppState { profile };
        let err = state
            .create_or_open_release(rid, unknown, None)
            .unwrap_err();

        assert_eq!(err.code(), "RepoError.CommitNotFound");
    }

    /// A release on a fresh project with one registered artifact.
    pub(crate) fn release_with_artifact(
        tmp: &std::path::Path,
    ) -> (AppState, RepoId, String, String) {
        let profile = test::profile(&tmp.join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let (rid, _, _, head) =
            fixtures::project(tmp.join("project"), &profile.storage, &signer).unwrap();

        let state = AppState { profile };
        let id = state
            .create_or_open_release(rid, radicle::git::Oid::from(head), None)
            .unwrap();
        let file = tmp.join("build.tar");
        std::fs::write(&file, "artifact bytes").unwrap();
        let digest = state.compute_artifact_cid(file).unwrap();
        state
            .register_artifact(rid, id.clone(), digest.cid.clone(), "build.tar".into(), 14)
            .unwrap();

        (state, rid, id, digest.cid)
    }

    fn locations(state: &AppState, rid: RepoId, id: &str, cid: &str) -> Vec<String> {
        let repo = state.profile.storage.repository(rid).unwrap();
        let id = radicle_artifact::ReleaseId::from_str(id).unwrap();
        let cid = super::parse_cid(cid).unwrap();
        let release = ArtifactStore::open(&repo)
            .unwrap()
            .get(&id)
            .unwrap()
            .unwrap();
        release
            .artifact(&cid)
            .unwrap()
            .locations()
            .values()
            .flatten()
            .map(|url| url.to_string())
            .collect()
    }

    #[test]
    fn add_and_remove_location() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid, id, cid) = release_with_artifact(tmp.path());
        let url = "https://example.com/build.tar";

        state
            .add_location(rid, id.clone(), cid.clone(), url.into())
            .unwrap();
        assert_eq!(locations(&state, rid, &id, &cid), [url]);

        state
            .remove_location(rid, id.clone(), cid.clone(), url.into())
            .unwrap();
        assert!(locations(&state, rid, &id, &cid).is_empty());
    }

    #[test]
    fn locations_are_listed_per_contributor() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid, id, cid) = release_with_artifact(tmp.path());
        let url = "https://example.com/build.tar";
        state
            .add_location(rid, id.clone(), cid.clone(), url.into())
            .unwrap();

        let other = SigningKey::from_seed(Seed::new([0xee; 32]));
        {
            let repo = state.profile.storage.repository(rid).unwrap();
            let mut releases = ArtifactStore::open(&repo).unwrap();
            let mut release = releases
                .get_mut(&radicle_artifact::ReleaseId::from_str(&id).unwrap())
                .unwrap();
            for url in [url, "https://mirror.example.com/build.tar"] {
                release
                    .add_location(
                        super::parse_cid(&cid).unwrap(),
                        url::Url::parse(url).unwrap(),
                        &other,
                    )
                    .unwrap();
            }
        }

        let mut locations = read_release(&state, rid, &id).unwrap().artifacts[0]
            .locations
            .iter()
            .map(|l| (*l.user.did(), l.url.clone()))
            .collect::<Vec<_>>();
        locations.sort();
        let me = radicle::identity::Did::from(state.profile.public_key);
        let them = radicle::identity::Did::from(*other.public_key());
        let mut expected = vec![
            (me, url.to_string()),
            (them, url.to_string()),
            (them, "https://mirror.example.com/build.tar".to_string()),
        ];
        expected.sort();
        assert_eq!(locations, expected);
    }

    #[test]
    fn artifacts_say_whether_they_are_folders() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid, id, file_cid) = release_with_artifact(tmp.path());
        let folder = tmp.path().join("dist");
        std::fs::create_dir(&folder).unwrap();
        std::fs::write(folder.join("app"), "folder bytes").unwrap();
        let digest = state.compute_artifact_cid(folder).unwrap();
        state
            .register_artifact(rid, id.clone(), digest.cid.clone(), "dist".into(), 12)
            .unwrap();

        let release = read_release(&state, rid, &id).unwrap();
        let directory = |cid: &str| {
            release
                .artifacts
                .iter()
                .find(|a| a.cid == cid)
                .unwrap()
                .directory
        };
        assert!(!directory(&file_cid));
        assert!(directory(&digest.cid));
    }

    #[test]
    fn add_location_rejects_unfetchable_urls() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid, id, cid) = release_with_artifact(tmp.path());

        for url in ["not a url", "iroh://abc", "radiroh://not-base32!"] {
            let err = state
                .add_location(rid, id.clone(), cid.clone(), url.into())
                .unwrap_err();
            assert_eq!(err.code(), "ArtifactError.InvalidLocation", "{url}");
        }
        assert!(locations(&state, rid, &id, &cid).is_empty());
    }

    #[test]
    fn delete_release_removes_own_release() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = test::profile(&tmp.path().join("home"), [0xff; 32]);
        let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
        let (rid, _, _, head) =
            fixtures::project(tmp.path().join("project"), &profile.storage, &signer).unwrap();
        let oid = radicle::git::Oid::from(head);

        let state = AppState { profile };
        let id = state.create_or_open_release(rid, oid, None).unwrap();
        state.delete_release(rid, id.clone()).unwrap();

        let repo = state.profile.storage.repository(rid).unwrap();
        let id = radicle_artifact::ReleaseId::from_str(&id).unwrap();
        assert!(
            ArtifactStore::open(&repo)
                .unwrap()
                .get(&id)
                .unwrap()
                .is_none()
        );
    }

    /// The release as the app reads it.
    pub(crate) fn read_release(state: &AppState, rid: RepoId, id: &str) -> Option<Release> {
        state
            .release_by_id(rid, radicle::git::Oid::from_str(id).unwrap())
            .unwrap()
    }

    /// Register `bytes` under the release as a peer who is not a delegate.
    fn register_as_other(
        state: &AppState,
        tmp: &std::path::Path,
        rid: RepoId,
        id: &str,
        bytes: &str,
    ) -> (std::path::PathBuf, String) {
        let file = tmp.join("theirs.tar");
        std::fs::write(&file, bytes).unwrap();
        let cid = state.compute_artifact_cid(file.clone()).unwrap().cid;

        let other = SigningKey::from_seed(Seed::new([0xee; 32]));
        let repo = state.profile.storage.repository(rid).unwrap();
        let mut releases = ArtifactStore::open(&repo).unwrap();
        let mut release = releases
            .get_mut(&radicle_artifact::ReleaseId::from_str(id).unwrap())
            .unwrap();
        release
            .register_artifact(super::parse_cid(&cid).unwrap(), "theirs.tar".into(), &other)
            .unwrap();

        (file, cid)
    }

    #[test]
    fn attest_artifact_signs_a_matching_build() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid, id, _) = release_with_artifact(tmp.path());
        let (file, cid) = register_as_other(&state, tmp.path(), rid, &id, "their bytes");

        state
            .attest_artifact(rid, id.clone(), cid.clone(), file)
            .unwrap();

        let release = read_release(&state, rid, &id).unwrap();
        let artifact = release.artifacts.iter().find(|a| a.cid == cid).unwrap();
        assert_eq!(artifact.attestations.len(), 1);
    }

    #[test]
    fn attest_artifact_rejects_a_different_build() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid, id, _) = release_with_artifact(tmp.path());
        let (_, cid) = register_as_other(&state, tmp.path(), rid, &id, "their bytes");
        let build = tmp.path().join("mine.tar");
        std::fs::write(&build, "other bytes").unwrap();

        let err = state
            .attest_artifact(rid, id.clone(), cid.clone(), build)
            .unwrap_err();

        assert_eq!(err.code(), "ArtifactError.CidMismatch");
        let release = read_release(&state, rid, &id).unwrap();
        let artifact = release.artifacts.iter().find(|a| a.cid == cid).unwrap();
        assert!(artifact.attestations.is_empty());
    }

    #[test]
    fn set_and_remove_artifact_metadata() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid, id, cid) = release_with_artifact(tmp.path());
        let metadata = |state: &AppState| {
            read_release(state, rid, &id).unwrap().artifacts[0]
                .metadata
                .get("arch")
                .cloned()
        };

        state
            .set_artifact_metadata(rid, id.clone(), cid.clone(), "arch".into(), "x86_64".into())
            .unwrap();
        assert_eq!(metadata(&state), Some("x86_64".into()));

        state
            .remove_artifact_metadata(rid, id.clone(), cid.clone(), "arch".into())
            .unwrap();
        assert_eq!(metadata(&state), None);
    }

    #[test]
    fn metadata_from_a_non_author_is_ignored() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid, id, cid) = release_with_artifact(tmp.path());

        let other = SigningKey::from_seed(Seed::new([0xee; 32]));
        {
            let repo = state.profile.storage.repository(rid).unwrap();
            let mut releases = ArtifactStore::open(&repo).unwrap();
            let mut release = releases
                .get_mut(&radicle_artifact::ReleaseId::from_str(&id).unwrap())
                .unwrap();
            release
                .set_metadata(
                    super::parse_cid(&cid).unwrap(),
                    "arch".into(),
                    "evil".into(),
                    &other,
                )
                .unwrap();
        }

        let release = read_release(&state, rid, &id).unwrap();
        assert_eq!(release.artifacts[0].metadata.get("arch"), None);
    }

    #[test]
    fn redact_artifact_hides_it_and_keeps_the_reason() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid, id, cid) = release_with_artifact(tmp.path());

        state
            .redact_artifact(rid, id.clone(), cid, "bad build".into())
            .unwrap();

        let artifact = &read_release(&state, rid, &id).unwrap().artifacts[0];
        assert!(artifact.redacted);
        assert_eq!(artifact.redactions[0].reason, "bad build");
    }

    #[test]
    fn redaction_by_a_non_delegate_does_not_hide() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid, id, cid) = release_with_artifact(tmp.path());

        let other = SigningKey::from_seed(Seed::new([0xee; 32]));
        {
            let repo = state.profile.storage.repository(rid).unwrap();
            let mut releases = ArtifactStore::open(&repo).unwrap();
            let mut release = releases
                .get_mut(&radicle_artifact::ReleaseId::from_str(&id).unwrap())
                .unwrap();
            release
                .redact(super::parse_cid(&cid).unwrap(), "spite".into(), &other)
                .unwrap();
        }

        let artifact = &read_release(&state, rid, &id).unwrap().artifacts[0];
        assert!(!artifact.redacted);
        assert_eq!(artifact.redactions.len(), 1);
    }
}
