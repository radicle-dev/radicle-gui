use radicle::crypto::PublicKey;
use radicle::explorer::Explorer;
use serde::Serialize;
use ts_rs::TS;

use radicle::node::Alias;
use radicle::node::config::{ConnectAddress, DefaultSeedingPolicy};

/// Service configuration.
#[derive(Debug, TS, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "config/")]
pub struct Config {
    /// Node Public Key in NID format.
    #[ts(as = "String")]
    pub public_key: PublicKey,
    /// Node alias.
    #[ts(as = "String")]
    pub alias: Alias,
    /// Default seeding policy.
    #[serde(default)]
    #[ts(type = "{ default: 'allow', scope: 'followed' | 'all' } | { default: 'block' }")]
    pub seeding_policy: DefaultSeedingPolicy,
    /// Public explorer URL template, e.g. `https://radicle.network/nodes/$host/$rid$path`.
    #[ts(as = "String")]
    pub public_explorer: Explorer,
    /// Preferred seed addresses, in priority order. Used to pick a host for
    /// explorer links.
    #[ts(as = "Vec<String>")]
    pub preferred_seeds: Vec<ConnectAddress>,
}

pub struct Version {
    pub version: String,
    pub head: String,
}

impl Serialize for Version {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&format!("{} ({})", self.version, self.head))
    }
}
