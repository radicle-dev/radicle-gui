use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::Duration;

use radicle::identity::{Did, RepoId};
use radicle::storage::ReadStorage;
use url::Url;

use radicle_artifact::{Cid, ReleaseId, Releases as ArtifactStore, cache_db_path};
use radicle_artifact_client::sync::Client;
use radicle_artifact_client::{DownloadArgs, FetchArgs, default_socket};
use radicle_artifact_core::cid as cid_utils;
use radicle_artifact_core::keys::EndpointId;
use radicle_artifact_core::protocol::{FetchLocation, FetchProgress, ImportMode, SeededEntry};

use crate::artifact::ArtifactNodeStatus;
use crate::error::Error;
use crate::traits::release_mut::{ReleasesMut, parse_cid};

/// Per-frame idle timeout for streaming calls. This bounds the wait for each
/// progress frame, not the whole transfer, so a download that keeps making
/// progress never times out while a stalled one does.
const FETCH_IDLE: Duration = Duration::from_secs(30);

/// Resolve the locations recorded on a COB into the concrete list the node
/// fetches from.
///
/// Endpoint (`radiroh://`) URLs become iroh locations; a bare host falls back
/// to the contributing DID's own endpoint. Stale pre-rename `iroh://`
/// locations are dropped, and every other scheme is passed through as a URL.
fn resolve_fetch_locations(locations: &BTreeMap<Did, BTreeSet<Url>>) -> Vec<FetchLocation> {
    let mut seen_ids: HashSet<EndpointId> = HashSet::new();
    let mut seen_urls: HashSet<&Url> = HashSet::new();
    let mut resolved = Vec::new();

    for (did, urls) in locations {
        for url in urls {
            if EndpointId::is_endpoint_url(url) {
                let id = match EndpointId::from_url(url) {
                    Ok(Some(id)) => Some(id),
                    Ok(None) => EndpointId::try_from(did).ok(),
                    Err(_) => None,
                };
                if let Some(id) = id
                    && seen_ids.insert(id)
                {
                    resolved.push(FetchLocation::Iroh(id));
                }
            } else if EndpointId::is_legacy_endpoint_url(url) {
                continue;
            } else if seen_urls.insert(url) {
                resolved.push(FetchLocation::Url(url.clone()));
            }
        }
    }

    resolved
}

/// The content ids seeded under `release`, leaving out those whose bytes are
/// missing from the store.
///
/// A node that predates per-release reporting lists no releases. Its entries
/// are kept, so the view falls back to what the repository seeds.
fn seeded_in_release(entries: Vec<SeededEntry>, release: ReleaseId) -> Vec<String> {
    entries
        .into_iter()
        .filter(|entry| entry.complete != Some(false))
        .filter(|entry| entry.releases.is_empty() || entry.releases.contains(&release.oid()))
        .map(|entry| entry.cid.to_string())
        .collect()
}

pub trait ArtifactNode: ReleasesMut {
    /// Client for the local artifact node's control socket.
    fn artifact_client(&self) -> Client {
        Client::new(default_socket(self.profile().home.path()))
    }

    /// Whether the artifact node is up. Used to decide between showing node
    /// stats and showing setup guidance, so a down node is not an error here.
    fn artifact_node_running(&self) -> bool {
        self.artifact_client().is_running()
    }

    /// Status of the local artifact node.
    fn artifact_node_status(&self) -> Result<ArtifactNodeStatus, Error> {
        // The node does not report where its store lives, so it is derived the
        // same way the node builds it: `<home>/artifacts/store`. Unlike the
        // control socket, no environment variable moves it.
        let store_path = self
            .profile()
            .home
            .path()
            .join(radicle_artifact_core::ARTIFACTS_DIR)
            .join("store")
            .to_string_lossy()
            .into_owned();

        Ok(ArtifactNodeStatus::new(
            self.artifact_client().status()?,
            store_path,
        ))
    }

    /// Every artifact the node currently seeds under a release, as content
    /// ids. One call per release view, rather than one per artifact row.
    ///
    /// A seeded tag can outlive its bytes (a wiped store, a restored backup).
    /// Those are left out, so the view offers to fetch or reseed them instead
    /// of claiming they are in the store. An unknown state counts as stored.
    fn seeded_artifacts(&self, rid: RepoId, release_id: String) -> Result<Vec<String>, Error> {
        let release = ReleaseId::from_str(&release_id)?;
        Ok(seeded_in_release(
            self.artifact_client().list_seeded(rid)?,
            release,
        ))
    }

    /// The locations recorded for one artifact, keyed by the node that
    /// contributed them.
    ///
    /// Unioned across every release carrying the content id, since peers who
    /// each created a release for the same commit before syncing split its
    /// locations between their COBs.
    fn artifact_locations(
        &self,
        rid: RepoId,
        cid: &Cid,
    ) -> Result<BTreeMap<Did, BTreeSet<Url>>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let store = ArtifactStore::open_cached(&repo, cache_db_path(profile.cobs()))?;

        let mut locations: BTreeMap<Did, BTreeSet<Url>> = BTreeMap::new();
        for (_, did, url) in store.locations_for(cid)? {
            locations.entry(did).or_default().insert(url);
        }

        Ok(locations)
    }

    /// Import a local file into the node and seed it, then announce the node's
    /// endpoint on the COB so peers can discover it. Returns the announced URL.
    fn seed_artifact(
        &self,
        rid: RepoId,
        release_id: String,
        cid: String,
        source_path: PathBuf,
    ) -> Result<String, Error> {
        let parsed = parse_cid(&cid)?;
        let kind = cid_utils::artifact_kind(&parsed)?;
        let release = *radicle::cob::ObjectId::from_str(&release_id)?;

        // `ImportMode::Copy` so the user can move or delete the source
        // afterwards without breaking what the node serves.
        self.artifact_client().seed(
            rid,
            release,
            parsed,
            source_path.as_path(),
            kind,
            ImportMode::Copy,
        )?;

        self.announce_own_location(rid, release_id, cid)
    }

    /// The location URL this node announces on a COB.
    fn own_location(&self) -> Result<Url, Error> {
        let did = Did::from(self.profile().public_key);
        Ok(EndpointId::try_from(&did)?.to_url())
    }

    /// Releases whose COB carries this node's location for `cid`.
    fn releases_announcing_own_location(
        &self,
        rid: RepoId,
        cid: &Cid,
    ) -> Result<Vec<ReleaseId>, Error> {
        let profile = self.profile();
        let repo = profile.storage.repository(rid)?;
        let store = ArtifactStore::open_cached(&repo, cache_db_path(profile.cobs()))?;
        let did = Did::from(profile.public_key);
        let url = self.own_location()?;

        Ok(store
            .locations_for(cid)?
            .into_iter()
            .filter(|(_, d, u)| *d == did && *u == url)
            .map(|(release, _, _)| release)
            .collect())
    }

    /// Announce this node's location for `cid` on a release, unless the
    /// release already carries it. Returns the announced URL.
    fn announce_own_location(
        &self,
        rid: RepoId,
        release_id: String,
        cid: String,
    ) -> Result<String, Error> {
        let url = self.own_location()?.to_string();
        let release = ReleaseId::from_str(&release_id)?;
        if !self
            .releases_announcing_own_location(rid, &parse_cid(&cid)?)?
            .contains(&release)
        {
            self.add_location(rid, release_id, cid, url.clone())?;
        }

        Ok(url)
    }

    /// Stop seeding an artifact under `release`, or under every release when
    /// `None`, and withdraw the location this node announced on those
    /// releases.
    ///
    /// The node is unseeded first, so a node that is down or refuses leaves
    /// the COB untouched. Only releases that carry our location get a
    /// removal, so a retry does not push the same op again.
    fn unseed_from(&self, rid: RepoId, release: Option<ReleaseId>, cid: &Cid) -> Result<(), Error> {
        self.artifact_client()
            .unseed(rid, release.map(|id| id.oid()), *cid)?;

        let url = self.own_location()?.to_string();
        for id in self.releases_announcing_own_location(rid, cid)? {
            if release.is_none_or(|r| r == id) {
                self.remove_location(rid, id.to_string(), cid.to_string(), url.clone())?;
            }
        }

        Ok(())
    }

    /// Stop seeding an artifact under one release and withdraw the location
    /// this node announced on it. Other releases that seed the same content id
    /// keep seeding it.
    fn unseed_artifact(&self, rid: RepoId, release_id: String, cid: String) -> Result<(), Error> {
        let release = ReleaseId::from_str(&release_id)?;
        self.unseed_from(rid, Some(release), &parse_cid(&cid)?)
    }

    /// Redact an artifact and stop this node serving it.
    ///
    /// Redaction on its own is only a COB record: it says the artifact should
    /// no longer be fetched, but it does not stop this node handing out the
    /// bytes or withdraw the location advertising them. Anyone redacting
    /// something they published wants it off their node too, so the two go
    /// together.
    ///
    /// The redaction is the permanent, public half, so it is written first and
    /// a node that is down or refuses the unseed does not undo it. A down node
    /// is serving nothing in any case.
    fn redact_and_unseed_artifact(
        &self,
        rid: RepoId,
        release_id: String,
        cid: String,
        reason: String,
    ) -> Result<(), Error> {
        self.redact_artifact(rid, release_id.clone(), cid.clone(), reason)?;

        let release = ReleaseId::from_str(&release_id)?;
        if let Err(err) = self.unseed_from(rid, Some(release), &parse_cid(&cid)?) {
            log::warn!("Redacted artifact could not be unseeded: {err}");
        }

        Ok(())
    }

    /// Delete a release and stop this node seeding its artifacts.
    ///
    /// As with redaction, the COB change is written first and the unseed is
    /// best effort: a down node is serving nothing in any case.
    fn delete_and_unseed_release(&self, rid: RepoId, release_id: String) -> Result<(), Error> {
        let id = ReleaseId::from_str(&release_id)?;
        let cids: Vec<Cid> = {
            let repo = self.profile().storage.repository(rid)?;
            ArtifactStore::open(&repo)?
                .get(&id)?
                .map(|release| release.artifacts().keys().copied().collect())
                .unwrap_or_default()
        };

        self.delete_release(rid, release_id.clone())?;

        if self.artifact_node_running() {
            let release = *radicle::cob::ObjectId::from_str(&release_id)?;
            let client = self.artifact_client();
            for cid in cids {
                if let Err(err) = client.unseed(rid, Some(release), cid) {
                    log::warn!("Artifact of a deleted release could not be unseeded: {err}");
                }
            }
        }

        Ok(())
    }

    /// Fetch an artifact from the locations on its COB, writing it to `dest`
    /// when given and otherwise only into the node's store.
    ///
    /// The node owns every transport and the export to disk; this resolves the
    /// locations and forwards the node's progress frames to `on_progress`.
    /// With `seed` set, the node tags the bytes under the release as it goes,
    /// and the node's location is announced on the COB once it is done.
    fn download_artifact(
        &self,
        rid: RepoId,
        release_id: String,
        cid: String,
        dest: Option<&Path>,
        seed: bool,
        on_progress: impl FnMut(&FetchProgress),
    ) -> Result<(), Error> {
        let parsed = parse_cid(&cid)?;
        let seed_release = seed
            .then(|| radicle::cob::ObjectId::from_str(&release_id))
            .transpose()?
            .map(|id| *id);

        let locations = resolve_fetch_locations(&self.artifact_locations(rid, &parsed)?);
        let client = self.artifact_client();
        match dest {
            Some(dest) => {
                client.download(
                    DownloadArgs {
                        rid,
                        cid: parsed,
                        locations,
                        dest: dest.to_path_buf(),
                        seed: seed_release,
                    },
                    FETCH_IDLE,
                    on_progress,
                )?;
            }
            None => {
                client.fetch(
                    FetchArgs {
                        rid,
                        cid: parsed,
                        locations,
                        seed: seed_release,
                    },
                    FETCH_IDLE,
                    on_progress,
                )?;
            }
        }

        if seed {
            self.announce_own_location(rid, release_id, cid)?;
        }

        Ok(())
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod test {
    use std::collections::{BTreeMap, BTreeSet};
    use std::str::FromStr;

    use radicle::crypto::{Seed, Signer, SigningKey};
    use radicle::identity::Did;
    use radicle::storage::ReadStorage;
    use radicle_artifact::{Cid, ReleaseId};
    use radicle_artifact_core::cid::compute_blob_cid;
    use radicle_artifact_core::keys::EndpointId;
    use radicle_artifact_core::protocol::{FetchLocation, SeededEntry};
    use url::Url;

    use super::{ArtifactNode, resolve_fetch_locations, seeded_in_release};
    use crate::traits::release_mut::test::{read_release, release_with_artifact};

    fn cid(content: &str) -> Cid {
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), content).unwrap();
        compute_blob_cid(file.path()).unwrap()
    }

    fn release(byte: char) -> ReleaseId {
        ReleaseId::from_str(&byte.to_string().repeat(40)).unwrap()
    }

    fn entry(cid: Cid, complete: Option<bool>, releases: &[ReleaseId]) -> SeededEntry {
        SeededEntry {
            cid,
            bytes: 0,
            complete,
            releases: releases.iter().map(|r| r.oid()).collect(),
        }
    }

    #[test]
    fn seeded_in_release_filters_by_release() {
        let (ours, theirs) = (release('a'), release('b'));
        let matching = cid("matching");
        let other = cid("other");
        let legacy = cid("legacy");
        let missing = cid("missing");
        let unknown = cid("unknown");

        let seeded = seeded_in_release(
            vec![
                entry(matching, Some(true), &[theirs, ours]),
                entry(other, Some(true), &[theirs]),
                entry(legacy, Some(true), &[]),
                entry(missing, Some(false), &[ours]),
                entry(unknown, None, &[ours]),
            ],
            ours,
        );

        assert_eq!(
            seeded,
            vec![
                matching.to_string(),
                legacy.to_string(),
                unknown.to_string()
            ]
        );
    }

    fn did(seed: u8) -> Did {
        Did::from(*SigningKey::from_seed(Seed::new([seed; 32])).public_key())
    }

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn resolve_fetch_locations_maps_each_scheme() {
        let (alice, bob, carol) = (did(0xaa), did(0xbb), did(0xcc));
        let id = |did: &Did| EndpointId::try_from(did).unwrap().to_string();
        let web = url("https://example.com/build.tar");

        let locations = BTreeMap::from([
            (
                alice,
                BTreeSet::from([url("radiroh://"), url("iroh://legacy"), web.clone()]),
            ),
            (
                bob,
                // Bob announces Alice's node too, and the same web URL.
                BTreeSet::from([
                    EndpointId::try_from(&bob).unwrap().to_url(),
                    EndpointId::try_from(&alice).unwrap().to_url(),
                    web.clone(),
                ]),
            ),
            // A bare endpoint URL stands for the contributor's own node.
            (carol, BTreeSet::from([url("radiroh://")])),
        ]);

        let resolved = resolve_fetch_locations(&locations);
        let mut ids = Vec::new();
        let mut urls = Vec::new();
        for location in resolved {
            match location {
                FetchLocation::Iroh(endpoint) => ids.push(endpoint.to_string()),
                FetchLocation::Url(u) => urls.push(u),
            }
        }
        ids.sort();
        let mut expected = vec![id(&alice), id(&bob), id(&carol)];
        expected.sort();

        assert_eq!(ids, expected);
        assert_eq!(urls, vec![web]);
    }

    #[test]
    fn redaction_stands_when_the_node_is_down() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid, id, cid) = release_with_artifact(tmp.path());
        assert!(!state.artifact_node_running());

        state
            .redact_and_unseed_artifact(rid, id.clone(), cid, "bad build".into())
            .unwrap();

        assert!(read_release(&state, rid, &id).unwrap().artifacts[0].redacted);
    }

    #[test]
    fn own_location_is_announced_once() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid, id, cid) = release_with_artifact(tmp.path());

        let head = || {
            let repo = state.profile.storage.repository(rid).unwrap();
            repo.backend
                .refname_to_id(&format!(
                    "refs/namespaces/{}/refs/cobs/dev.radicle.artifact/{id}",
                    state.profile.public_key
                ))
                .unwrap()
        };

        let url = state
            .announce_own_location(rid, id.clone(), cid.clone())
            .unwrap();
        let announced = head();
        state
            .announce_own_location(rid, id.clone(), cid.clone())
            .unwrap();

        assert_eq!(head(), announced);
        assert_eq!(url, state.own_location().unwrap().to_string());
        let locations = &read_release(&state, rid, &id).unwrap().artifacts[0].locations;
        assert_eq!(
            locations.iter().map(|l| l.url.as_str()).collect::<Vec<_>>(),
            [url.as_str()]
        );
    }

    #[test]
    fn deletion_stands_when_the_node_is_down() {
        let tmp = tempfile::tempdir().unwrap();
        let (state, rid, id, _) = release_with_artifact(tmp.path());

        state.delete_and_unseed_release(rid, id.clone()).unwrap();

        assert!(read_release(&state, rid, &id).is_none());
    }
}
