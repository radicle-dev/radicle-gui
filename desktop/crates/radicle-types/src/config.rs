use std::path::Path;

use radicle::crypto::PublicKey;
use radicle::explorer::Explorer;
use serde::Serialize;
use ts_rs::TS;

use radicle::node::Alias;
use radicle::node::config::{ConnectAddress, DefaultSeedingPolicy};

use crate::error::Error;

/// Check an explorer template. Unlike `radicle::explorer::Explorer::from_str`,
/// this accepts a template that names its host rather than using `$host`.
pub fn validate_explorer(template: &str) -> Result<(), Error> {
    if !template.starts_with("http://") && !template.starts_with("https://") {
        return Err(Error::InvalidConfig(
            "the explorer must start with http:// or https://".into(),
        ));
    }
    if !template.contains("$rid") {
        return Err(Error::InvalidConfig(
            "the explorer must contain $rid".into(),
        ));
    }
    Ok(())
}

/// Replace one top-level key of `config.json`, leaving every other key as
/// the user wrote it.
pub fn set_value(path: &Path, key: &str, value: serde_json::Value) -> Result<(), Error> {
    let mut raw: serde_json::Value = serde_json::from_slice(&std::fs::read(path)?)?;
    let object = raw
        .as_object_mut()
        .ok_or_else(|| Error::InvalidConfig("config.json is not an object".into()))?;
    object.insert(key.into(), value);

    serde_json::from_value::<radicle::profile::Config>(raw.clone())
        .map_err(|e| Error::InvalidConfig(e.to_string()))?;

    let mut contents = serde_json::to_vec_pretty(&raw)?;
    contents.push(b'\n');
    std::fs::write(path, contents)?;

    Ok(())
}

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
