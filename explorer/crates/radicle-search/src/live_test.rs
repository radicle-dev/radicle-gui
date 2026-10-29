use std::collections::HashSet;
use std::process::{Child, Command};
use std::str::FromStr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use radicle::identity::{Did, RepoId};
use radicle::issue::cache::Issues as _;
use radicle::patch::cache::Patches as _;
use radicle::storage::{ReadRepository as _, ReadStorage as _};

use crate::config::Config;
use crate::index::repo::DocumentKey;
use crate::index::{Indexes, cob, release, repo};
use crate::indexer::Indexer;
use crate::indexer::build;
use crate::query::{CobKind, ReleaseView, SearchClient, SearchError, SortField};

struct LiveMeili {
    child: Child,
    pub url: String,
    _dir: tempfile::TempDir,
}

impl LiveMeili {
    fn spawn() -> LiveMeili {
        let bin = std::env::var("RADICLE_SEARCH_TEST_MEILI_BIN").unwrap_or_else(|_| {
            let release = include_str!("../../../tests/support/meilisearch-release")
                .trim()
                .to_string();
            format!(
                "{}/../../tests/tmp/bin/meilisearch/{release}/meilisearch",
                env!("CARGO_MANIFEST_DIR")
            )
        });
        let dir = tempfile::tempdir().unwrap();
        let port = free_port();
        let child = Command::new(&bin)
            .args([
                "--http-addr",
                &format!("127.0.0.1:{port}"),
                "--db-path",
                dir.path().join("db").to_str().unwrap(),
                "--no-analytics",
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .expect("meilisearch binary not found; run ./scripts/install-binaries");
        let url = format!("http://127.0.0.1:{port}");
        wait_for_health(&url);
        LiveMeili {
            child,
            url,
            _dir: dir,
        }
    }
}

impl Drop for LiveMeili {
    fn drop(&mut self) {
        self.child.kill().ok();
        self.child.wait().ok();
    }
}

fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

fn wait_for_health(url: &str) {
    for _ in 0..100 {
        if std::net::TcpStream::connect(url.trim_start_matches("http://")).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    panic!("meilisearch did not become healthy at {url}");
}

/// A [`Config`] pointing at `meili_url`, with an empty index prefix and the
/// same rescan/reconnect/batch durations as [`Config::from_env`]'s defaults
/// (unused by the paths these tests exercise).
fn config_with(meili_url: &str) -> Config {
    Config {
        meili_url: meili_url.to_string(),
        meili_key: None,
        index_prefix: String::new(),
        rescan_interval: Duration::from_secs(3600),
        reconnect_backoff: Duration::from_secs(5),
        batch_interval: Duration::from_secs(30),
        task_poll_interval: Duration::from_millis(50),
        task_timeout: Duration::from_secs(5),
    }
}

/// A deterministic [`RepoId`] built from a synthetic Oid (`radicle`'s own
/// `From<Oid> for RepoId`, fed 20 bytes derived from `i`) rather than an
/// actual git object -- fine for tests that only need distinct, valid rids.
fn synthetic_rid(i: u64) -> RepoId {
    let mut bytes = [0u8; radicle::git::Oid::LEN_SHA1];
    bytes[..8].copy_from_slice(&i.to_be_bytes());
    RepoId::from(radicle::git::Oid::from_sha1(bytes))
}

/// Poll `condition` at 100ms intervals until it returns `true` or `timeout`
/// elapses, returning whether it succeeded. Meilisearch's write tasks are
/// async server-side, so tests wait for them to land rather than assuming
/// synchronous consistency.
async fn poll_until<F, Fut>(timeout: Duration, mut condition: F) -> bool
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = bool>,
{
    let deadline = Instant::now() + timeout;
    loop {
        if condition().await {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

fn cob_docs(
    profile: &radicle::Profile,
    repo: &radicle::storage::git::Repository,
    rid: RepoId,
) -> (
    Vec<cob::Document>,
    Vec<cob::Document>,
    Vec<release::Document>,
) {
    let issues = profile.issues(repo).expect("open issue cache");
    let issue_docs: Vec<cob::Document> = issues
        .list()
        .expect("list issues")
        .filter_map(|r| r.ok())
        .map(|(id, issue)| build::issue_document(rid, &id, &issue).expect("build issue document"))
        .collect();
    let patches = profile.patches(repo).expect("open patch cache");
    let patch_docs: Vec<cob::Document> = patches
        .list()
        .expect("list patches")
        .filter_map(|r| r.ok())
        .map(|(id, patch)| build::patch_document(rid, &id, &patch).expect("build patch document"))
        .collect();
    let doc_at = repo.identity_doc().expect("read identity doc");
    let release_docs = build::release_documents(rid, repo, doc_at.delegates());
    (issue_docs, patch_docs, release_docs)
}

/// Build the fixture, connect real [`Indexes`] to `meili`, and upsert every
/// document type through the same builders [`Indexer`] uses. Returns a
/// read-only [`SearchClient`] once the fixture's repo document is
/// confirmed present (Meilisearch's upsert tasks complete asynchronously).
async fn seeded_client(
    meili: &LiveMeili,
) -> (tempfile::TempDir, radicle::Profile, RepoId, SearchClient) {
    let (tmp, profile, rid) = crate::test::fixture();
    {
        use radicle::storage::WriteStorage as _;
        let signer = radicle::crypto::SigningKey::from_seed(radicle::crypto::Seed::new([0xff; 32]));
        let repo = profile
            .storage
            .repository_mut(rid)
            .expect("open fixture repo for writing");
        let (_, head) = repo.head().expect("fixture head");
        let mut releases = radicle_artifact::Releases::open(&repo).expect("open release store");
        let mut release = releases
            .create(head, None, &signer)
            .expect("create release");
        let cid = radicle_artifact::Cid::from_str(
            "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        )
        .expect("valid cid");
        release
            .register_artifact(cid, "linux-amd64".to_string(), &signer)
            .expect("register artifact");
    }
    let config = config_with(&meili.url);
    let indexes = Indexes::connect(&config).expect("connect to meilisearch");
    indexes
        .configure_all_with_retry()
        .await
        .expect("configure indexes");

    let db = profile.database().expect("open node database");
    let repo = profile.storage.repository(rid).expect("open fixture repo");
    let doc_at = repo.identity_doc().expect("read identity doc");
    let repo_doc = build::document(&profile, &db, rid, &doc_at.doc)
        .expect("build repo document")
        .expect("fixture repo document is public");
    let (issue_docs, patch_docs, release_docs) = cob_docs(&profile, &repo, rid);
    let node_docs =
        build::node_documents(&profile, &db, std::iter::empty()).expect("build node documents");
    let policy_docs = build::policy_documents(&profile).expect("build policy documents");
    let inventory_docs = {
        use radicle::node::routing::Store as _;
        build::inventory_documents(db.entries().expect("routing entries"))
    };

    indexes
        .repos
        .upsert(std::slice::from_ref(&repo_doc), repo::Document::PRIMARY_KEY)
        .await
        .expect("upsert repo doc");
    indexes
        .issues
        .upsert(&issue_docs, cob::Document::PRIMARY_KEY)
        .await
        .expect("upsert issue docs");
    indexes
        .patches
        .upsert(&patch_docs, cob::Document::PRIMARY_KEY)
        .await
        .expect("upsert patch docs");
    indexes
        .releases
        .upsert(&release_docs, release::Document::PRIMARY_KEY)
        .await
        .expect("upsert release docs");
    indexes
        .nodes
        .upsert(&node_docs, crate::index::node::Document::PRIMARY_KEY)
        .await
        .expect("upsert node docs");
    indexes
        .policies
        .upsert(&policy_docs, crate::index::policy::Document::PRIMARY_KEY)
        .await
        .expect("upsert policy docs");
    indexes
        .inventory
        .upsert(
            &inventory_docs,
            crate::index::inventory::Document::PRIMARY_KEY,
        )
        .await
        .expect("upsert inventory docs");

    let client = SearchClient::new(&meili.url, None, "", Duration::from_secs(5))
        .expect("construct search client");
    let ready = poll_until(Duration::from_secs(10), || {
        let client = client.clone();
        async move {
            let repo_ready = matches!(client.get_repo_doc(rid).await, Ok(Some(_)));
            let issue_ready = matches!(
                client.list_cobs(CobKind::Issues, rid, None, 0, 10).await,
                Ok(docs) if docs.len() == 1
            );
            let patch_ready = matches!(
                client.list_cobs(CobKind::Patches, rid, None, 0, 10).await,
                Ok(docs) if docs.len() == 1
            );
            let node_ready = matches!(client.get_node(&profile.public_key).await, Ok(Some(_)));
            let release_ready = matches!(
                client.list_releases(rid, ReleaseView::default(), 0, 10).await,
                Ok(docs) if docs.len() == 1
            );
            repo_ready && issue_ready && patch_ready && node_ready && release_ready
        }
    })
    .await;
    assert!(
        ready,
        "fixture repo/issue/patch/node/release docs did not appear in the index within 10s"
    );

    (tmp, profile, rid, client)
}

#[tokio::test]
#[ignore]
async fn live_filters_and_reads() {
    let meili = LiveMeili::spawn();
    let (_tmp, profile, rid, client) = seeded_client(&meili).await;

    let docs = client.get_repo_docs(&[rid]).await.unwrap();
    assert_eq!(docs.len(), 1);
    assert_eq!(docs[0].name, "hello-world");

    let did = Did::from(profile.public_key);
    let delegate_rids = client.repos_by_delegate(&did, 10).await.unwrap();
    assert_eq!(delegate_rids, vec![rid]);

    let open = client
        .list_cobs(CobKind::Issues, rid, Some("open"), 0, 10)
        .await
        .unwrap();
    assert_eq!(open.len(), 1);
    let issue: radicle::issue::Issue = serde_json::from_str(&open[0].cob).unwrap();
    assert_eq!(issue.title(), "Issue #1");

    let closed = client
        .list_cobs(CobKind::Issues, rid, Some("closed"), 0, 10)
        .await
        .unwrap();
    assert_eq!(closed.len(), 0);

    let aliases = client.get_aliases(&[profile.public_key]).await.unwrap();
    assert_eq!(
        aliases.get(&profile.public_key).map(|a| a.to_string()),
        Some("seed".to_string())
    );

    // "hallo-worlx" is a real 1-character-typo of "hello-world" on both
    // words -- unlike the brief's "helo-wrld", it stays at/above
    // Meilisearch's default minWordSizeForTypos (5 chars), so it actually
    // exercises typo tolerance instead of silently matching zero terms.
    let hits = client.search_by_query("hallo-worlx", 0, 10).await.unwrap();
    assert_eq!(hits, vec![rid]);
}

#[tokio::test]
#[ignore]
async fn live_release_reads() {
    let meili = LiveMeili::spawn();
    let (_tmp, profile, rid, client) = seeded_client(&meili).await;
    let did = Did::from(profile.public_key);

    let listed = client
        .list_releases(rid, ReleaseView::default(), 0, 10)
        .await
        .unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].title.as_deref(), Some("Second commit"));
    assert_eq!(listed[0].artifact_names, vec!["linux-amd64".to_string()]);
    assert!(listed[0].creator_is_delegate);

    let fetched = client
        .get_release(rid, &listed[0].cob_id)
        .await
        .unwrap()
        .expect("release document by id");
    assert_eq!(fetched.id, listed[0].id);
    let release: radicle_artifact::Release = serde_json::from_str(&fetched.cob).unwrap();
    assert_eq!(release.creator(), &did);

    for q in ["amd64", "second commit", &did.to_string()] {
        let hits = client
            .search_releases(rid, q, ReleaseView::default(), 0, 10)
            .await
            .unwrap();
        assert_eq!(hits.len(), 1, "query {q:?} should hit the release");
    }
    let miss = client
        .search_releases(rid, "windows-arm64", ReleaseView::default(), 0, 10)
        .await
        .unwrap();
    assert!(miss.is_empty());

    let empty_q = client
        .search_releases(rid, "", ReleaseView::default(), 0, 10)
        .await
        .unwrap();
    assert_eq!(empty_q.len(), 1);
    assert_eq!(empty_q[0].cob_id, listed[0].cob_id);
}

#[tokio::test]
#[ignore]
async fn live_pagination_cap() {
    const EXTRA: u64 = 1500;

    let meili = LiveMeili::spawn();
    let (_tmp, _profile, rid, client) = seeded_client(&meili).await;
    let config = config_with(&meili.url);
    let indexes = Indexes::connect(&config).expect("connect to meilisearch");

    let template = client
        .get_repo_docs(&[rid])
        .await
        .unwrap()
        .into_iter()
        .next()
        .expect("fixture repo doc present");

    let synthetic: Vec<repo::Document> = (0..EXTRA)
        .map(|i| {
            let synthetic_rid = synthetic_rid(i);
            let mut doc = template.clone();
            doc.id = DocumentKey::new(synthetic_rid);
            doc.rid = synthetic_rid;
            doc
        })
        .collect();
    indexes
        .repos
        .upsert(&synthetic, repo::Document::PRIMARY_KEY)
        .await
        .expect("upsert synthetic repo docs");

    let ready = poll_until(Duration::from_secs(30), || {
        let client = client.clone();
        async move {
            client
                .sorted_rids(SortField::SeedingCount, 0, 1500)
                .await
                .map(|rids| rids.len() >= 1201)
                .unwrap_or(false)
        }
    })
    .await;
    assert!(
        ready,
        "synthetic repo docs did not finish indexing within 30s"
    );

    let rids = client
        .sorted_rids(SortField::SeedingCount, 0, 1500)
        .await
        .unwrap();
    assert!(
        rids.len() >= 1201,
        "expected at least 1201 rids past the engine's default 1000-hit cap, got {}",
        rids.len()
    );

    let by_id = |offset, limit| {
        let client = client.clone();
        async move {
            client
                .sorted_rids(SortField::Rid, offset, limit)
                .await
                .unwrap()
        }
    };
    let first_page = by_id(0, 50).await;
    let second_page = by_id(50, 50).await;
    assert_eq!(first_page.len(), 50);
    assert_eq!(second_page.len(), 50);
    assert!(first_page.iter().all(|rid| !second_page.contains(rid)));
    let both_pages: Vec<RepoId> = first_page.into_iter().chain(second_page).collect();
    assert_eq!(by_id(0, 100).await, both_pages);
    assert!(both_pages.windows(2).all(|pair| pair[0] < pair[1]));
}

#[tokio::test]
#[ignore]
async fn live_schema_mismatch_and_not_found() {
    let meili = LiveMeili::spawn();
    let (_tmp, profile, _rid, client) = seeded_client(&meili).await;
    let config = config_with(&meili.url);
    let indexes = Indexes::connect(&config).expect("connect to meilisearch");

    let did = Did::from(profile.public_key);
    let mismatched_rid = synthetic_rid(90_001);
    let unindexed_rid = synthetic_rid(90_002);

    let mismatched = serde_json::json!({
        "v": 99,
        "id": mismatched_rid.canonical(),
        "rid": mismatched_rid.to_string(),
        "name": "schema-mismatch",
        "description": "raw document bypassing the schema version",
        "defaultBranch": "master",
        "delegates": [did.to_string()],
        "seedingCount": 0,
        "issueCounts": {"open": 0, "closed": 0},
        "patchCounts": {"open": 0, "draft": 0, "archived": 0, "merged": 0},
        "head": null,
        "headCommitterTime": null,
        "activityTimestamps": [],
    });
    indexes
        .repos
        .upsert(
            std::slice::from_ref(&mismatched),
            repo::Document::PRIMARY_KEY,
        )
        .await
        .expect("upsert raw document");

    let ready = poll_until(Duration::from_secs(10), || {
        let client = client.clone();
        async move { client.get_repo_doc(mismatched_rid).await.is_err() }
    })
    .await;
    assert!(ready, "schema-mismatch document did not appear within 10s");

    let err = client.get_repo_doc(mismatched_rid).await.unwrap_err();
    assert!(matches!(err, SearchError::SchemaMismatch), "{err:?}");

    let missing = client.get_repo_doc(unindexed_rid).await.unwrap();
    assert!(missing.is_none());
}

#[tokio::test]
#[ignore]
async fn live_unseed_purges() {
    let meili = LiveMeili::spawn();
    let (_tmp, profile, rid) = crate::test::fixture();
    let config = config_with(&meili.url);
    let indexes = Indexes::connect(&config).expect("connect to meilisearch");
    indexes
        .configure_all_with_retry()
        .await
        .expect("configure indexes");

    let profile = Arc::new(profile);
    let indexer = Indexer::new(profile.clone(), Arc::new(indexes), config);
    indexer.reindex(rid).await.expect("initial reindex");

    let client = SearchClient::new(&meili.url, None, "", Duration::from_secs(5))
        .expect("construct search client");
    let seeded = poll_until(Duration::from_secs(10), || {
        let client = client.clone();
        async move {
            let repo_present = matches!(client.get_repo_doc(rid).await, Ok(Some(_)));
            let issue_present = matches!(
                client.list_cobs(CobKind::Issues, rid, None, 0, 10).await,
                Ok(docs) if docs.len() == 1
            );
            repo_present && issue_present
        }
    })
    .await;
    assert!(
        seeded,
        "reindex did not populate repo/issue docs within 10s"
    );

    profile
        .policies_mut()
        .expect("open policy store")
        .unseed(&rid)
        .expect("unseed fixture repo");

    indexer.reindex(rid).await.expect("reindex after unseed");

    let purged = poll_until(Duration::from_secs(10), || {
        let client = client.clone();
        async move {
            let repo_gone = matches!(client.get_repo_doc(rid).await, Ok(None));
            let issues_gone = matches!(
                client.list_cobs(CobKind::Issues, rid, None, 0, 10).await,
                Ok(docs) if docs.is_empty()
            );
            repo_gone && issues_gone
        }
    })
    .await;
    assert!(purged, "unseed did not purge repo/issue docs within 10s");
}

#[tokio::test]
#[ignore]
async fn live_node_announced_keeps_follow_alias_and_skips_non_seeds() {
    use radicle::crypto::{Seed, Signer, SigningKey};
    use radicle::node::{Alias, Event, Features, Timestamp, UserAgent};

    let meili = LiveMeili::spawn();
    let (_tmp, profile, _rid) = crate::test::fixture();
    let config = config_with(&meili.url);
    let indexes = Arc::new(Indexes::connect(&config).expect("connect"));
    indexes
        .configure_all_with_retry()
        .await
        .expect("configure indexes");

    let followed = *SigningKey::from_seed(Seed::new([0x11; 32])).public_key();
    let laptop = *SigningKey::from_seed(Seed::new([0x22; 32])).public_key();
    profile
        .policies_mut()
        .expect("open policy store")
        .follow(&followed, Some(&Alias::new("local-name")))
        .expect("follow");
    profile
        .database_mut()
        .expect("open node db")
        .init(
            &followed,
            Features::SEED,
            &Alias::new("announced"),
            &UserAgent::default(),
            Timestamp::try_from(crate::test::TIMESTAMP + 1).unwrap(),
            [],
        )
        .expect("init address book");

    let db = profile.database().expect("open node db");
    let primed = build::node_documents(&profile, &db, std::iter::empty()).expect("node docs");
    indexes
        .nodes
        .upsert(&primed, crate::index::node::Document::PRIMARY_KEY)
        .await
        .expect("prime nodes index");

    let profile = Arc::new(profile);
    let indexer = Indexer::new(profile.clone(), indexes.clone(), config);
    let client = SearchClient::new(&meili.url, None, "", Duration::from_secs(5))
        .expect("construct search client");
    let ready = poll_until(Duration::from_secs(10), || {
        let client = client.clone();
        async move { matches!(client.get_node(&followed).await, Ok(Some(_))) }
    })
    .await;
    assert!(ready, "primed node doc did not appear within 10s");

    let ts = Timestamp::try_from(crate::test::TIMESTAMP + 2).unwrap();
    indexer
        .handle_event(
            &Event::NodeAnnounced {
                nid: followed,
                alias: Alias::new("announced"),
                timestamp: ts,
                features: Features::SEED,
                addresses: vec![],
            },
            &mut HashSet::new(),
        )
        .await
        .expect("handle followed announcement");
    indexer
        .handle_event(
            &Event::NodeAnnounced {
                nid: laptop,
                alias: Alias::new("laptop"),
                timestamp: ts,
                features: Features::NONE,
                addresses: vec![],
            },
            &mut HashSet::new(),
        )
        .await
        .expect("handle laptop announcement");

    tokio::time::sleep(Duration::from_secs(2)).await;
    let doc = client
        .get_node(&followed)
        .await
        .expect("get followed node")
        .expect("followed node document present");
    assert_eq!(doc.alias.as_deref(), Some("local-name"));
    assert!(matches!(client.get_node(&laptop).await, Ok(None)));

    indexer
        .handle_event(
            &Event::NodeAnnounced {
                nid: laptop,
                alias: Alias::new("laptop"),
                timestamp: ts,
                features: Features::SEED,
                addresses: vec![],
            },
            &mut HashSet::new(),
        )
        .await
        .expect("handle laptop seed announcement");
    let appeared = poll_until(Duration::from_secs(10), || {
        let client = client.clone();
        async move {
            matches!(client.get_node(&laptop).await, Ok(Some(d)) if d.alias.as_deref() == Some("laptop"))
        }
    })
    .await;
    assert!(
        appeared,
        "seed announcement did not create the node document within 10s"
    );
}

#[tokio::test]
#[ignore]
async fn live_error_mapping() {
    let meili = LiveMeili::spawn();

    let tight = SearchClient::new(&meili.url, None, "", Duration::from_millis(1))
        .expect("construct search client");
    let err = tight
        .sorted_rids(SortField::SeedingCount, 0, 10)
        .await
        .unwrap_err();
    assert!(matches!(err, SearchError::Timeout), "{err:?}");

    let sane = SearchClient::new(&meili.url, None, "", Duration::from_secs(5))
        .expect("construct search client");
    drop(meili);
    let err = sane
        .sorted_rids(SortField::SeedingCount, 0, 10)
        .await
        .unwrap_err();
    assert!(matches!(err, SearchError::Meili(_)), "{err:?}");
}
