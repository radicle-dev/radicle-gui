use std::path::Path;

use radicle::Storage;
use radicle::cob::migrate;
use radicle::crypto::ssh::Keystore;
use radicle::crypto::{Seed, Signer, SigningKey};
use radicle::node::{Features, Timestamp, UserAgent};
use radicle::profile::Home;
use radicle::{node, profile};

pub const TIMESTAMP: u64 = 1671125284;

/// Create a new profile.
pub fn profile(home: &Path, seed: [u8; 32]) -> radicle::Profile {
    let home = Home::new(home).unwrap();
    let alias = node::Alias::new("seed");
    let config = profile::Config::new(alias.clone());
    let keystore = Keystore::new(&home.keys());

    let signer = SigningKey::from_seed(Seed::new(seed));
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

    let node_db = home.database_mut(config.node.database).unwrap();
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
        config,
    }
}
