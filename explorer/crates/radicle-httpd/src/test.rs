use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::str::FromStr;
use std::sync::Arc;

use axum::body::{Body, Bytes};
use axum::http::{Method, Request};
use axum::Router;
use serde_json::Value;
use tower::ServiceExt;

use radicle::cob::migrate;
use radicle::cob::patch::MergeTarget;
use radicle::cob::Title;
use radicle::crypto::ssh::Keystore;
use radicle::crypto::{Seed, Signer, SigningKey};
use radicle::git::fmt::RefString;
use radicle::identity::{project, Visibility};
use radicle::node::{Features, Timestamp, UserAgent};
use radicle::profile::{env, Home};
use radicle::storage::{
    ReadRepository, ReadStorage, SignRepository, WriteRepository, WriteStorage,
};
use radicle::{node, profile};
use radicle::{Node, Storage};

use crate::api::Context;

pub const RID: &str = "rad:z4FucBZHZMCsxTyQE1dfE2YR59Qbp";
pub const RID_PRIVATE: &str = "rad:zLuTzcmoWMcdK37xqArS8eckp9vK";
pub const HEAD: &str = "e8c676b9e3b42308dc9d218b70faa5408f8e58ca";
pub const PARENT: &str = "ee8d6a29304623a78ebfa5eeed5af674d0e58f83";
pub const INITIAL_COMMIT: &str = "f604ce9fd5b7cc77b7609beda45ea8760bee78f7";
pub const DID: &str = "did:key:z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi";
pub const ISSUE_ID: &str = "ca67d195c0b308b51810dedd93157a20764d5db5";
pub const PATCH_ID: &str = "b4084412ea3644d7dd7ae075c1cbbd4d702db0ec";
pub const TIMESTAMP: u64 = 1671125284;
pub const CONTRIBUTOR_ALIAS: &str = "seed";

/// Create a new profile.
pub fn profile(home: &Path, seed: [u8; 32]) -> radicle::Profile {
    let home = Home::new(home).unwrap();
    let keystore = Keystore::new(&home.keys());
    let signer = SigningKey::from_seed(Seed::new(seed));
    let alias = node::Alias::new("seed");
    let storage = Storage::open(
        home.storage(),
        radicle::git::UserInfo {
            alias: alias.clone(),
            key: *signer.public_key(),
        },
    )
    .unwrap();

    let mut db = home.policies_mut().unwrap();
    db.follow(signer.public_key(), Some(&alias)).unwrap();

    let node_db = home.database_mut(Default::default()).unwrap();
    node_db
        .init(
            signer.public_key(),
            Features::SEED,
            &alias,
            &UserAgent::default(),
            Timestamp::try_from(TIMESTAMP).unwrap(),
            [],
        )
        .unwrap();

    // Migrate COBs cache.
    let mut cobs = home.cobs_db_mut().unwrap();
    cobs.migrate(migrate::ignore).unwrap();

    radicle::storage::git::transport::local::register(storage.clone());
    keystore.store(&signer, "radicle", None).unwrap();

    radicle::Profile {
        home,
        storage,
        keystore,
        public_key: *signer.public_key(),
        config: profile::Config::new(alias),
    }
}

pub fn seed(dir: &Path) -> Context {
    let home = dir.join("radicle");
    let profile = profile(home.as_path(), [0xff; 32]);
    let signer = SigningKey::from_seed(Seed::new([0xff; 32]));

    crate::logger::init().ok();

    seed_with_signer(dir, profile, &signer)
}

fn seed_with_signer(dir: &Path, profile: radicle::Profile, signer: &SigningKey) -> Context {
    const DEFAULT_BRANCH: &str = "master";

    crate::logger::init().ok();

    profile.policies_mut().unwrap();
    profile.database_mut().unwrap(); // Create the database.

    let mut policies = profile.policies_mut().unwrap();
    let workdir = dir.join("hello-world-private");
    fs::create_dir_all(&workdir).unwrap();

    // add commits to workdir (repo)
    let mut opts = radicle::git::raw::RepositoryInitOptions::new();
    opts.initial_head(DEFAULT_BRANCH);
    let repo = radicle::git::raw::Repository::init_opts(&workdir, &opts).unwrap();
    let tree = radicle::git::write_tree(
        Path::new("README"),
        "Hello Private World!\n".as_bytes(),
        &repo,
    )
    .unwrap();

    let sig_time = radicle::git::raw::Time::new(1673001014, 0);
    let sig =
        radicle::git::raw::Signature::new("Alice Liddell", "alice@radicle.xyz", &sig_time).unwrap();

    repo.commit(Some("HEAD"), &sig, &sig, "Initial commit\n", &tree, &[])
        .unwrap();

    // rad init
    let repo = radicle::git::raw::Repository::open(&workdir).unwrap();
    let name = project::ProjectName::from_str("hello-world-private").unwrap();
    let description = "Private Rad repository for tests".to_string();
    let branch = RefString::try_from(DEFAULT_BRANCH).unwrap();
    let visibility = Visibility::Private {
        allow: BTreeSet::default(),
    };
    let (rid, _, _) = radicle::rad::init(
        &repo,
        name,
        &description,
        branch,
        visibility,
        signer,
        &profile.storage,
    )
    .unwrap();

    policies
        .set_seed_policy(&rid, node::policy::Policy::Block)
        .unwrap();

    let workdir = dir.join("hello-world");

    env::set_var(env::GIT_COMMITTER_DATE, TIMESTAMP.to_string());

    fs::create_dir_all(&workdir).unwrap();

    // add commits to workdir (repo)
    let mut opts = radicle::git::raw::RepositoryInitOptions::new();
    opts.initial_head(DEFAULT_BRANCH);
    let repo = radicle::git::raw::Repository::init_opts(&workdir, &opts).unwrap();
    let tree =
        radicle::git::write_tree(Path::new("README"), "Hello World!\n".as_bytes(), &repo).unwrap();

    let sig_time = radicle::git::raw::Time::new(1673001014, 0);
    let sig =
        radicle::git::raw::Signature::new("Alice Liddell", "alice@radicle.xyz", &sig_time).unwrap();

    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, "Initial commit\n", &tree, &[])
        .unwrap();
    let commit = repo.find_commit(oid).unwrap();

    repo.checkout_tree(tree.as_object(), None).unwrap();

    let tree = radicle::git::write_tree(
        Path::new("CONTRIBUTING"),
        "Thank you very much!\n".as_bytes(),
        &repo,
    )
    .unwrap();
    let sig_time = radicle::git::raw::Time::new(1673002014, 0);
    let sig =
        radicle::git::raw::Signature::new("Alice Liddell", "alice@radicle.xyz", &sig_time).unwrap();

    let oid2 = repo
        .commit(
            Some("HEAD"),
            &sig,
            &sig,
            "Add contributing file\n",
            &tree,
            &[&commit],
        )
        .unwrap();
    let commit2 = repo.find_commit(oid2).unwrap();

    repo.checkout_tree(tree.as_object(), None).unwrap();

    fs::create_dir(workdir.join("dir1")).unwrap();
    fs::write(
        workdir.join("dir1").join("README"),
        "Hello World from dir1!\n",
    )
    .unwrap();
    let mut index = repo.index().unwrap();
    index.add_path(Path::new("dir1/README")).unwrap();
    index.write().unwrap();

    let oid = index.write_tree().unwrap();
    let tree = repo.find_tree(oid).unwrap();

    let sig_time = radicle::git::raw::Time::new(1673003014, 0);
    let sig =
        radicle::git::raw::Signature::new("Alice Liddell", "alice@radicle.xyz", &sig_time).unwrap();
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        "Add another folder\n",
        &tree,
        &[&commit2],
    )
    .unwrap();

    // rad init
    let repo = radicle::git::raw::Repository::open(&workdir).unwrap();
    let name = project::ProjectName::from_str("hello-world").unwrap();
    let description = "Rad repository for tests".to_string();
    let branch = RefString::try_from(DEFAULT_BRANCH).unwrap();
    let visibility = Visibility::default();
    let (rid, _, _) = radicle::rad::init(
        &repo,
        name,
        &description,
        branch,
        visibility,
        signer,
        &profile.storage,
    )
    .unwrap();
    policies.seed(&rid, node::policy::Scope::All).unwrap();
    let node_handle = &mut Node::new(profile.socket_from_env());
    profile
        .seed(rid, node::policy::Scope::All, node_handle)
        .unwrap();
    profile.add_inventory(rid, node_handle).unwrap();

    let storage = &profile.storage;
    let repo = storage.repository(rid).unwrap();
    let mut issues = profile.issues_mut(&repo, signer).unwrap();
    let issue = issues
        .create(
            Title::new("Issue #1").unwrap(),
            "Change 'hello world' to 'hello everyone'".to_string(),
            &[],
            &[],
            [],
        )
        .unwrap();
    tracing::debug!(target: "test", "Contributor issue: {}", issue.id());

    // eq. rad patch open
    let mut patches = profile.patches_mut(&repo, signer).unwrap();
    let oid = radicle::git::Oid::from_str(HEAD).unwrap();
    let base = radicle::git::Oid::from_str(PARENT).unwrap();
    let patch = patches
        .create(
            Title::new("A new `hello world`").unwrap(),
            "change `hello world` in README to something else",
            MergeTarget::Delegates,
            base,
            oid,
            &[],
        )
        .unwrap();
    tracing::debug!(target: "test", "Contributor patch: {}", patch.id());

    let workdir = dir.join("again-hello-world");

    env::set_var(env::GIT_COMMITTER_DATE, TIMESTAMP.to_string());

    fs::create_dir_all(&workdir).unwrap();

    // add commits to workdir (repo)
    let mut opts = radicle::git::raw::RepositoryInitOptions::new();
    opts.initial_head(DEFAULT_BRANCH);
    let repo = radicle::git::raw::Repository::init_opts(&workdir, &opts).unwrap();
    let tree = radicle::git::write_tree(
        Path::new("README"),
        "Hello World Again!\n".as_bytes(),
        &repo,
    )
    .unwrap();

    let sig_time = radicle::git::raw::Time::new(1673001014, 0);
    let sig =
        radicle::git::raw::Signature::new("Alice Liddell", "alice@radicle.xyz", &sig_time).unwrap();

    repo.commit(Some("HEAD"), &sig, &sig, "Initial commit\n", &tree, &[])
        .unwrap();

    repo.checkout_tree(tree.as_object(), None).unwrap();

    // rad init
    let repo = radicle::git::raw::Repository::open(&workdir).unwrap();
    let name = project::ProjectName::from_str("again-hello-world").unwrap();
    let description = "Rad repository for sorting".to_string();
    let branch = RefString::try_from(DEFAULT_BRANCH).unwrap();
    let visibility = Visibility::default();
    let (rid, _, _) = radicle::rad::init(
        &repo,
        name,
        &description,
        branch,
        visibility,
        signer,
        &profile.storage,
    )
    .unwrap();
    policies.seed(&rid, node::policy::Scope::Followed).unwrap();
    profile
        .seed(rid, node::policy::Scope::Followed, node_handle)
        .unwrap();
    profile.add_inventory(rid, node_handle).unwrap();

    let options = crate::Options {
        aliases: std::collections::HashMap::new(),
        listen: axum_listener::DualAddr::Tcp(std::net::SocketAddr::from(([0, 0, 0, 0], 8080))),
        cache: Some(crate::DEFAULT_CACHE_SIZE),
        search: None,
    };

    let web_config = crate::api::WebConfig::from_profile(&profile);
    Context::new(Arc::new(profile), web_config, &options).expect("test context creation failed")
}

/// Create a test context with multiple peers and canonical refs configured.
///
/// This sets up:
/// - The hello-world repo from `seed()` as the base
/// - A second peer that forks the repo (same `master` head)
/// - An additional branch (`feature/branch`) on the second peer only
/// - A tag (`v1.0`) on both peers (reaches canonical consensus)
/// - A tag (`v2.0-rc`) on the second peer only (does not reach consensus)
/// - The identity document is updated with:
///   - The second peer added as a delegate
///   - A `xyz.radicle.crefs` payload with rules for `refs/heads/*` and `refs/tags/*`
pub fn seed_multi_peer(dir: &Path) -> Context {
    use radicle::identity::doc::PayloadId;
    use radicle::identity::Identity;

    let ctx = seed(dir);

    let signer1 = SigningKey::from_seed(Seed::new([0xff; 32]));
    let signer2 = SigningKey::from_seed(Seed::new([0xee; 32]));

    let rid = radicle::identity::RepoId::from_str(RID).unwrap();
    let storage = &ctx.profile().storage;

    {
        let mut policies = ctx.profile().policies_mut().unwrap();
        policies
            .follow(signer2.public_key(), Some(&node::Alias::new("peer2")))
            .unwrap();
    }

    {
        let repo = storage.repository_mut(rid).unwrap();
        let mut identity = Identity::load_mut(&repo, &signer1).unwrap();
        let current_doc = repo.identity_doc().unwrap();

        let new_doc = current_doc
            .doc
            .clone()
            .with_edits(|raw| {
                let did2: radicle::identity::Did = (*signer2.public_key()).into();
                if !raw.delegates.contains(&did2) {
                    raw.delegates.push(did2);
                }
                raw.threshold = 1;
                let crefs_payload: serde_json::Value = serde_json::json!({
                    "rules": {
                        "refs/heads/*": {
                            "allow": "delegates",
                            "threshold": 1
                        },
                        "refs/tags/*": {
                            "allow": "delegates",
                            "threshold": 2
                        }
                    }
                });
                raw.payload.insert(
                    PayloadId::canonical_refs(),
                    radicle::identity::doc::Payload::from(crefs_payload),
                );
            })
            .unwrap();

        identity
            .update(
                Title::new("Add second delegate and crefs").unwrap(),
                "",
                &new_doc,
            )
            .unwrap();

        let new_head = repo.identity_head_of(signer1.public_key()).unwrap();
        repo.set_identity_head_to(new_head).unwrap();

        repo.sign_refs(&signer1).unwrap();
    }

    radicle::rad::fork(rid, &signer2, storage).unwrap();

    {
        let repo = storage.repository_mut(rid).unwrap();
        let raw = repo.raw();

        let head_oid = radicle::git::raw::Oid::from_str(HEAD).unwrap();
        let parent_oid = radicle::git::raw::Oid::from_str(PARENT).unwrap();

        let pk1 = signer1.public_key();
        let pk2 = signer2.public_key();

        raw.reference(
            &format!("refs/namespaces/{pk1}/refs/tags/v1.0"),
            head_oid,
            true,
            "test: add tag v1.0 for peer1",
        )
        .unwrap();
        raw.reference(
            &format!("refs/namespaces/{pk2}/refs/tags/v1.0"),
            head_oid,
            true,
            "test: add tag v1.0 for peer2",
        )
        .unwrap();

        raw.reference(
            &format!("refs/namespaces/{pk2}/refs/tags/v2.0-rc"),
            parent_oid,
            true,
            "test: add tag v2.0-rc for peer2 only",
        )
        .unwrap();

        raw.reference(
            &format!("refs/namespaces/{pk2}/refs/heads/feature/branch"),
            parent_oid,
            true,
            "test: add feature/branch for peer2",
        )
        .unwrap();

        repo.sign_refs(&signer1).unwrap();
        repo.sign_refs(&signer2).unwrap();

        // Materialize canonical refs at the top level, simulating what the
        // node does via `set_canonical_refs` after a fetch.
        for (refname, oid) in [
            ("refs/heads/master", head_oid),
            ("refs/tags/v1.0", head_oid),
            ("refs/heads/feature/branch", parent_oid),
        ] {
            raw.reference(refname, oid, true, "test: set canonical ref")
                .unwrap();
        }
    }

    ctx
}

/// A repository whose default branch tip is a merge commit.
///
/// Returned by [`seed_merge`].
pub struct MergeFixture {
    pub ctx: Context,
    pub rid: radicle::identity::RepoId,
    /// Tip of the merge target, used as the `base` of the diff.
    pub base: radicle::git::Oid,
    /// The merge commit, used as the `head` of the diff.
    pub head: radicle::git::Oid,
    /// The commit contributed by the merged-in side.
    pub feature: radicle::git::Oid,
}

/// Seed a repository whose default branch tip is a merge commit.
///
/// The topology, with commit dates in parentheses:
///
/// ```text
///     root (t1) ──┬── feature (t2) ──┐
///                 │                  ├── merge (t4)  <- `head`, tip of `master`
///                 └── base    (t3) ──┘
/// ```
///
/// `base` is deliberately given a *newer* commit date than `feature`, so that a
/// commit-date-ordered revwalk from the merge reaches `base` before it reaches
/// `feature`. That is the case that used to truncate the commit list of
/// `GET /repos/:rid/diff/:base/:oid` down to just the merge itself.
pub fn seed_merge(dir: &Path) -> MergeFixture {
    const DEFAULT_BRANCH: &str = "master";

    fn tree<'a>(
        repo: &'a radicle::git::raw::Repository,
        entries: &[(&str, radicle::git::raw::Oid)],
    ) -> radicle::git::raw::Tree<'a> {
        let mut builder = repo.treebuilder(None).unwrap();
        for (name, oid) in entries {
            builder
                .insert(name, *oid, i32::from(radicle::git::raw::FileMode::Blob))
                .unwrap();
        }
        repo.find_tree(builder.write().unwrap()).unwrap()
    }

    crate::logger::init().ok();

    let home = dir.join("radicle");
    let profile = profile(home.as_path(), [0xfe; 32]);
    let signer = SigningKey::from_seed(Seed::new([0xfe; 32]));

    env::set_var(env::GIT_COMMITTER_DATE, TIMESTAMP.to_string());

    let workdir = dir.join("hello-merge");
    fs::create_dir_all(&workdir).unwrap();

    let mut opts = radicle::git::raw::RepositoryInitOptions::new();
    opts.initial_head(DEFAULT_BRANCH);
    let repo = radicle::git::raw::Repository::init_opts(&workdir, &opts).unwrap();

    let sig = |secs: i64| {
        radicle::git::raw::Signature::new(
            "Alice Liddell",
            "alice@radicle.xyz",
            &radicle::git::raw::Time::new(secs, 0),
        )
        .unwrap()
    };

    // The two sides touch different files, so the merge tree is just the union
    // of both and no merge machinery is needed to build it.
    let readme = repo.blob("Hello World!\n".as_bytes()).unwrap();
    let feature_blob = repo.blob("A feature.\n".as_bytes()).unwrap();
    let base_blob = repo.blob("Moved on.\n".as_bytes()).unwrap();

    let root_tree = tree(&repo, &[("README", readme)]);
    let root = repo
        .commit(
            None,
            &sig(1673001014),
            &sig(1673001014),
            "Initial commit\n",
            &root_tree,
            &[],
        )
        .unwrap();
    let root = repo.find_commit(root).unwrap();

    let feature_tree = tree(&repo, &[("README", readme), ("FEATURE", feature_blob)]);
    let feature = repo
        .commit(
            None,
            &sig(1673002014),
            &sig(1673002014),
            "Add a feature\n",
            &feature_tree,
            &[&root],
        )
        .unwrap();

    let base_tree = tree(&repo, &[("README", readme), ("MASTER", base_blob)]);
    let base = repo
        .commit(
            None,
            &sig(1673003014),
            &sig(1673003014),
            "Advance master\n",
            &base_tree,
            &[&root],
        )
        .unwrap();

    let merge_tree = tree(
        &repo,
        &[
            ("README", readme),
            ("FEATURE", feature_blob),
            ("MASTER", base_blob),
        ],
    );
    let head = repo
        .commit(
            None,
            &sig(1673004014),
            &sig(1673004014),
            "Merge branch 'master' into feature\n",
            &merge_tree,
            &[
                &repo.find_commit(feature).unwrap(),
                &repo.find_commit(base).unwrap(),
            ],
        )
        .unwrap();

    // Point the default branch at the merge so that `rad init` pushes the whole
    // topology into storage.
    let branch = format!("refs/heads/{DEFAULT_BRANCH}");
    repo.reference(&branch, head, true, "test: point master at the merge")
        .unwrap();
    repo.set_head(&branch).unwrap();

    let mut checkout = radicle::git::raw::build::CheckoutBuilder::new();
    repo.checkout_head(Some(checkout.force())).unwrap();

    let repo = radicle::git::raw::Repository::open(&workdir).unwrap();
    let (rid, _, _) = radicle::rad::init(
        &repo,
        project::ProjectName::from_str("hello-merge").unwrap(),
        "Rad repository whose head is a merge commit",
        RefString::try_from(DEFAULT_BRANCH).unwrap(),
        Visibility::default(),
        &signer,
        &profile.storage,
    )
    .unwrap();

    let options = crate::Options {
        aliases: std::collections::HashMap::new(),
        listen: axum_listener::DualAddr::Tcp(std::net::SocketAddr::from(([0, 0, 0, 0], 8080))),
        cache: Some(crate::DEFAULT_CACHE_SIZE),
        search: None,
    };
    let web_config = crate::api::WebConfig::from_profile(&profile);
    let ctx = Context::new(Arc::new(profile), web_config, &options)
        .expect("test context creation failed");

    MergeFixture {
        ctx,
        rid,
        base: base.into(),
        head: head.into(),
        feature: feature.into(),
    }
}

pub async fn get(app: &Router, path: impl ToString) -> Response {
    Response(
        app.clone()
            .oneshot(request(path, Method::GET, None))
            .await
            .unwrap(),
    )
}

pub async fn get_with_headers<'a>(
    app: &Router,
    path: impl ToString,
    headers: impl IntoIterator<Item = (&'a str, &'a str)>,
) -> Response {
    let mut request = Request::builder()
        .method(Method::GET)
        .uri(path.to_string())
        .header("Content-Type", "application/json");
    for (name, value) in headers {
        request = request.header(name, value);
    }

    Response(
        app.clone()
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap(),
    )
}

fn request(path: impl ToString, method: Method, body: Option<Body>) -> Request<Body> {
    let request = Request::builder()
        .method(method)
        .uri(path.to_string())
        .header("Content-Type", "application/json");

    request.body(body.unwrap_or_else(Body::empty)).unwrap()
}

#[derive(Debug)]
pub struct Response(axum::response::Response);

impl Response {
    pub async fn json(self) -> Value {
        let body = self.body().await;
        serde_json::from_slice(&body).unwrap()
    }

    pub fn status(&self) -> axum::http::StatusCode {
        self.0.status()
    }

    pub fn headers(&self) -> &axum::http::HeaderMap {
        self.0.headers()
    }

    pub async fn body(self) -> Bytes {
        axum::body::to_bytes(self.0.into_body(), usize::MAX)
            .await
            .unwrap()
    }
}
