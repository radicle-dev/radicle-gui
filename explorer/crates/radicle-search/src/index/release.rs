use std::collections::BTreeSet;

use meilisearch_sdk::settings::{PaginationSetting, Settings};
use radicle::cob::ObjectId;
use radicle::git::Oid;
use radicle::identity::doc::Delegates;
use radicle::identity::{Did, RepoId};
use radicle::storage::git::Repository;
use radicle_artifact::display::{CommitTitle, TagName};
use radicle_artifact::{Artifact, Release};
use serde::{Deserialize, Serialize};

use crate::index::{self, SCHEMA_VERSION, cob};

pub const SEARCHABLE: &[&str] = &[
    "title",
    "tagName",
    "description",
    "artifactNames",
    "artifactUrls",
    "dids",
];
pub const FILTERABLE: &[&str] = &["rid", "cobId", "creatorIsDelegate", "redacted"];
pub const SORTABLE: &[&str] = &["timestamp"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub v: u32,
    pub id: String,
    pub rid: RepoId,
    pub cob_id: String,
    pub timestamp: i64,
    pub title: Option<String>,
    pub tag_name: Option<String>,
    pub description: String,
    pub artifact_names: Vec<String>,
    pub artifact_urls: Vec<String>,
    pub dids: Vec<Did>,
    pub creator_is_delegate: bool,
    pub redacted: bool,
    pub cob: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Text {
    pub title: Option<String>,
    pub tag_name: Option<String>,
    pub description: String,
}

impl Document {
    pub const PRIMARY_KEY: &str = "id";

    pub fn new(
        rid: RepoId,
        id: &ObjectId,
        release: &Release,
        text: Text,
        delegates: &Delegates,
    ) -> Result<Self, serde_json::Error> {
        let artifacts = release.artifacts();
        Ok(Self {
            v: SCHEMA_VERSION,
            id: cob::doc_id(rid, id),
            rid,
            cob_id: id.to_string(),
            timestamp: release.timestamp().as_secs() as i64,
            title: text.title,
            tag_name: text.tag_name,
            description: text.description,
            artifact_names: artifacts.values().map(|a| a.name().to_string()).collect(),
            artifact_urls: artifacts
                .values()
                .flat_map(|a| a.locations().values().flatten().map(|u| u.to_string()))
                .collect(),
            dids: participants(release),
            creator_is_delegate: delegates.contains(release.creator()),
            redacted: fully_redacted(release, delegates),
            cob: serde_json::to_string(release)?,
        })
    }
}

pub fn participants(release: &Release) -> Vec<Did> {
    let mut dids: BTreeSet<Did> = BTreeSet::from([*release.creator()]);
    for artifact in release.artifacts().values() {
        dids.insert(*artifact.author());
        dids.extend(artifact.locations().keys().copied());
        dids.extend(artifact.attestations().iter().copied());
        dids.extend(artifact.redactions().keys().copied());
    }
    dids.into_iter().collect()
}

pub fn redacted_by_trusted(artifact: &Artifact, delegates: &Delegates) -> bool {
    artifact
        .redactions()
        .keys()
        .any(|did| did == artifact.author() || delegates.contains(did))
}

pub fn fully_redacted(release: &Release, delegates: &Delegates) -> bool {
    let artifacts = release.artifacts();
    !artifacts.is_empty()
        && artifacts
            .values()
            .all(|artifact| redacted_by_trusted(artifact, delegates))
}

pub fn text(repo: &Repository, release: &Release) -> Text {
    let title = release
        .tag()
        .and_then(|tag| repo.title(tag))
        .or_else(|| repo.title(release.oid()));
    let tag_name = release.tag().and_then(|tag| repo.tag_name(tag));
    let description = release
        .tag()
        .map(|tag| tag_body(repo, tag))
        .unwrap_or_default();
    Text {
        title,
        tag_name,
        description,
    }
}

pub fn tag_body(repo: &Repository, tag: &Oid) -> String {
    let Ok(obj) = repo.backend.find_object((*tag).into(), None) else {
        return String::new();
    };
    let Some(tag) = obj.as_tag() else {
        return String::new();
    };
    let Some(message) = tag.message().ok().flatten() else {
        return String::new();
    };
    message
        .lines()
        .skip(1)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

pub fn text_matches<'a>(q: &str, fields: impl IntoIterator<Item = &'a str>) -> bool {
    let needle = q.trim().to_lowercase();
    if needle.is_empty() {
        return true;
    }
    fields
        .into_iter()
        .any(|field| field.to_lowercase().contains(&needle))
}

pub fn settings() -> Settings {
    Settings::new()
        .with_searchable_attributes(SEARCHABLE)
        .with_filterable_attributes(FILTERABLE)
        .with_sortable_attributes(SORTABLE)
        .with_pagination(PaginationSetting {
            max_total_hits: index::MAX_TOTAL_HITS,
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::{SCHEMA_VERSION, cob};
    use std::str::FromStr;

    use radicle::storage::git::Repository;
    use radicle_artifact::Release;

    #[test]
    fn release_document_serializes_to_spec_shape() {
        let rid = RepoId::from_str("rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp").unwrap();
        let did =
            Did::from_str("did:key:z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi").unwrap();
        let doc = Document {
            v: SCHEMA_VERSION,
            id: cob::doc_id(rid, "deadbeef"),
            rid,
            cob_id: "deadbeef".to_string(),
            timestamp: 7,
            title: Some("v1.0".to_string()),
            tag_name: Some("v1.0".to_string()),
            description: "notes".to_string(),
            artifact_names: vec!["linux-amd64".to_string()],
            artifact_urls: vec!["https://example.com/a.tar.gz".to_string()],
            dids: vec![did],
            creator_is_delegate: true,
            redacted: false,
            cob: "{}".to_string(),
        };

        assert_eq!(
            serde_json::to_value(&doc).unwrap(),
            serde_json::json!({
                "v": 1,
                "id": "z4FucBZHZMCsxTyQE1dfE2YR59Qbp_deadbeef",
                "rid": "rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp",
                "cobId": "deadbeef",
                "timestamp": 7,
                "title": "v1.0",
                "tagName": "v1.0",
                "description": "notes",
                "artifactNames": ["linux-amd64"],
                "artifactUrls": ["https://example.com/a.tar.gz"],
                "dids": ["did:key:z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi"],
                "creatorIsDelegate": true,
                "redacted": false,
                "cob": "{}",
            })
        );
    }

    #[test]
    fn settings_expose_search_filter_and_sort_attributes() {
        let settings = settings();
        assert_eq!(
            settings.searchable_attributes.as_deref(),
            Some(&SEARCHABLE.iter().map(|s| s.to_string()).collect::<Vec<_>>()[..])
        );
        assert_eq!(
            settings.filterable_attributes.as_ref().map(Vec::len),
            Some(FILTERABLE.len())
        );
        assert_eq!(
            settings.sortable_attributes.as_deref(),
            Some(&SORTABLE.iter().map(|s| s.to_string()).collect::<Vec<_>>()[..])
        );
    }

    use radicle::crypto::{Seed, SigningKey};
    use radicle::storage::{ReadRepository as _, ReadStorage as _, WriteStorage as _};
    use radicle_artifact::{Cid, Releases};

    const CID: &str = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const LOCATION: &str = "https://example.com/linux-amd64.tar.gz";
    const DELEGATE_SEED: [u8; 32] = [0xff; 32];
    const NON_DELEGATE_SEED: [u8; 32] = [0xee; 32];

    fn create_release(
        profile: &radicle::Profile,
        rid: RepoId,
        seed: [u8; 32],
        tag: Option<radicle::git::Oid>,
    ) -> (radicle::cob::ObjectId, Release) {
        let signer = SigningKey::from_seed(Seed::new(seed));
        let repo = profile.storage.repository_mut(rid).unwrap();
        let (_, head) = repo.head().unwrap();
        let mut releases = Releases::open(&repo).unwrap();
        let mut release = releases.create(head, tag, &signer).unwrap();
        let cid = Cid::from_str(CID).unwrap();
        release
            .register_artifact(cid, "linux-amd64".to_string(), &signer)
            .unwrap();
        release
            .add_location(cid, url::Url::parse(LOCATION).unwrap(), &signer)
            .unwrap();
        let oid = release.id().oid();
        drop(release);
        let release = releases
            .get(&radicle_artifact::ReleaseId::from(oid))
            .unwrap()
            .unwrap();
        (radicle::cob::ObjectId::from(oid), release)
    }

    fn annotated_tag(repo: &Repository, message: &str) -> radicle::git::Oid {
        let (_, head) = repo.head().unwrap();
        let commit = repo.backend.find_commit(head.into()).unwrap();
        let sig = radicle::git::raw::Signature::now("seed", "seed@example.com").unwrap();
        repo.backend
            .tag_annotation_create("v1.0.0", commit.as_object(), &sig, message)
            .unwrap()
            .into()
    }

    #[test]
    fn document_new_extracts_cob_fields_and_participants() {
        let (_tmp, profile, rid) = crate::test::fixture();
        let (id, release) = create_release(&profile, rid, DELEGATE_SEED, None);
        let repo = profile.storage.repository(rid).unwrap();
        let doc_at = repo.identity_doc().unwrap();

        let doc = Document::new(rid, &id, &release, Text::default(), doc_at.delegates()).unwrap();

        assert_eq!(doc.v, SCHEMA_VERSION);
        assert_eq!(doc.id, cob::doc_id(rid, id));
        assert_eq!(doc.rid, rid);
        assert_eq!(doc.cob_id, id.to_string());
        assert_eq!(doc.timestamp, release.timestamp().as_secs() as i64);
        assert_eq!(doc.artifact_names, vec!["linux-amd64".to_string()]);
        assert_eq!(doc.artifact_urls, vec![LOCATION.to_string()]);
        assert_eq!(doc.dids, vec![*release.creator()]);
        assert!(doc.creator_is_delegate);
        assert!(!doc.redacted);
        let roundtrip: Release = serde_json::from_str(&doc.cob).unwrap();
        assert_eq!(roundtrip, release);
    }

    #[test]
    fn non_delegate_creator_clears_the_delegate_flag() {
        let (_tmp, profile, rid) = crate::test::fixture();
        let (id, release) = create_release(&profile, rid, NON_DELEGATE_SEED, None);
        let repo = profile.storage.repository(rid).unwrap();
        let doc_at = repo.identity_doc().unwrap();

        let doc = Document::new(rid, &id, &release, Text::default(), doc_at.delegates()).unwrap();

        assert!(!doc.creator_is_delegate);
    }

    #[test]
    fn redacting_the_only_artifact_sets_the_redacted_flag() {
        let (_tmp, profile, rid) = crate::test::fixture();
        let (id, _) = create_release(&profile, rid, DELEGATE_SEED, None);
        let signer = SigningKey::from_seed(Seed::new(DELEGATE_SEED));
        let repo = profile.storage.repository_mut(rid).unwrap();
        let mut releases = Releases::open(&repo).unwrap();
        let mut release = releases
            .get_mut(&radicle_artifact::ReleaseId::from(id))
            .unwrap();
        release
            .redact(
                Cid::from_str(CID).unwrap(),
                "bad build".to_string(),
                &signer,
            )
            .unwrap();
        drop(release);
        let release = releases
            .get(&radicle_artifact::ReleaseId::from(id))
            .unwrap()
            .unwrap();
        let doc_at = repo.identity_doc().unwrap();

        let doc = Document::new(rid, &id, &release, Text::default(), doc_at.delegates()).unwrap();

        assert!(doc.redacted);
        assert!(fully_redacted(&release, doc_at.delegates()));
    }

    #[test]
    fn text_resolves_title_tag_name_and_body_from_an_annotated_tag() {
        let (_tmp, profile, rid) = crate::test::fixture();
        let tag = {
            let repo = profile.storage.repository(rid).unwrap();
            annotated_tag(&repo, "v1.0.0\n\nFirst stable release.\nSee the notes.\n")
        };
        let (_, release) = create_release(&profile, rid, DELEGATE_SEED, Some(tag));
        let repo = profile.storage.repository(rid).unwrap();

        let text = text(&repo, &release);

        assert_eq!(text.title.as_deref(), Some("v1.0.0"));
        assert_eq!(text.tag_name.as_deref(), Some("v1.0.0"));
        assert_eq!(text.description, "First stable release.\nSee the notes.");
    }

    #[test]
    fn text_falls_back_to_the_commit_summary_without_a_tag() {
        let (_tmp, profile, rid) = crate::test::fixture();
        let (_, release) = create_release(&profile, rid, DELEGATE_SEED, None);
        let repo = profile.storage.repository(rid).unwrap();

        let text = text(&repo, &release);

        assert_eq!(text.title.as_deref(), Some("Second commit"));
        assert_eq!(text.tag_name, None);
        assert_eq!(text.description, "");
    }

    #[test]
    fn tag_body_is_empty_for_a_single_line_message() {
        let (_tmp, profile, rid) = crate::test::fixture();
        let repo = profile.storage.repository(rid).unwrap();
        let tag = annotated_tag(&repo, "v1.0.0\n");

        assert_eq!(tag_body(&repo, &tag), "");
    }

    #[test]
    fn text_matches_is_case_insensitive_substring_over_any_field() {
        assert!(text_matches("AMD64", ["linux-amd64", "notes"]));
        assert!(text_matches(
            "did:key:z6Mk",
            ["did:key:z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi"]
        ));
        assert!(!text_matches("arm", ["linux-amd64"]));
        assert!(text_matches("", ["anything"]));
        assert!(text_matches("  amd64  ", ["linux-amd64"]));
    }
}
