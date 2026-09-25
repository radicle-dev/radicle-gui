use std::str::FromStr;

use radicle::cob::Label;
use radicle::cob::Title;
use radicle::cob::patch::MergeTarget;
use radicle::crypto::{Seed, Signer, SigningKey};
use radicle::identity::Did;
use radicle::identity::Visibility;
use radicle::identity::project;
use radicle::node::{Features, Timestamp, UserAgent};
use radicle::profile;
use radicle::profile::Home;
use radicle::storage::ReadStorage as _;
use radicle::test::fixtures;
use radicle::{Storage, node};

pub const TIMESTAMP: u64 = 1755700000;

pub fn fixture() -> (
    tempfile::TempDir,
    radicle::Profile,
    radicle::identity::RepoId,
) {
    let tmp = tempfile::tempdir().unwrap();
    let home_dir = tmp.path().join("radicle");
    let signer = SigningKey::from_seed(Seed::new([0xff; 32]));
    let alias = node::Alias::new("seed");

    let home = Home::new(&home_dir).unwrap();
    let storage = Storage::open(
        home.storage(),
        radicle::git::UserInfo {
            alias: alias.clone(),
            key: *signer.public_key(),
        },
    )
    .unwrap();

    let mut policies = home.policies_mut().unwrap();
    policies.follow(signer.public_key(), Some(&alias)).unwrap();

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

    let mut cobs = home.cobs_db_mut().unwrap();
    cobs.migrate(radicle::cob::migrate::ignore).unwrap();

    radicle::storage::git::transport::local::register(storage.clone());

    let keystore = radicle::crypto::ssh::Keystore::new(&home.keys());

    let profile = radicle::Profile {
        home,
        storage,
        keystore,
        public_key: *signer.public_key(),
        config: profile::Config::new(alias),
    };

    #[allow(unsafe_code)]
    unsafe {
        radicle::profile::env::set_var(
            radicle::profile::env::GIT_COMMITTER_DATE,
            TIMESTAMP.to_string(),
        );
    }

    let workdir = tmp.path().join("hello-world");
    std::fs::create_dir_all(&workdir).unwrap();
    let (repo, head) = fixtures::repository(&workdir);

    let name = project::ProjectName::from_str("hello-world").unwrap();
    let (rid, _, _) = radicle::rad::init(
        &repo,
        name,
        "Rad repository for tests",
        radicle::git::fmt::refname!("master"),
        Visibility::default(),
        &signer,
        &profile.storage,
    )
    .unwrap();

    policies.seed(&rid, node::policy::Scope::All).unwrap();

    let stored = profile.storage.repository(rid).unwrap();

    let me = Did::from(*signer.public_key());
    let bug = Label::new("bug").unwrap();
    let mut issues = profile.issues_mut(&stored, &signer).unwrap();
    issues
        .create(
            Title::new("Issue #1").unwrap(),
            "Change 'hello world' to 'hello everyone'".to_string(),
            std::slice::from_ref(&bug),
            &[me],
            [],
        )
        .unwrap();
    drop(issues);

    let oid = radicle::git::Oid::from(head);
    let base = radicle::git::Oid::from(repo.find_commit(head).unwrap().parent_id(0).unwrap());

    let mut patches = profile.patches_mut(&stored, &signer).unwrap();
    patches
        .create(
            Title::new("A new hello world").unwrap(),
            "change hello world in README to something else",
            MergeTarget::Delegates,
            base,
            oid,
            &[bug],
        )
        .unwrap();

    (tmp, profile, rid)
}
