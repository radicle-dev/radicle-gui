use serde::Serialize;
use ts_rs::TS;

use radicle::crypto::PublicKey;
use radicle::identity::Did;
use radicle::node::Alias;

/// A user of the Radicle network, as known to the local node.
#[derive(Debug, TS, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "user/")]
pub struct User {
    #[ts(as = "String")]
    pub did: Did,
    #[ts(as = "String")]
    pub public_key: PublicKey,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(as = "Option<String>", optional)]
    pub alias: Option<Alias>,
    pub ssh: Ssh,
    /// Whether the local node follows this user.
    pub following: bool,
    /// Whether this is the local node's own identity.
    pub is_local: bool,
}

/// The SSH representations of a user's public key.
#[derive(Debug, TS, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "user/")]
pub struct Ssh {
    /// The SSH long key, as printed by `ssh-add -L`.
    pub full: String,
    /// The SSH key fingerprint, as printed by `ssh-add -l`.
    pub hash: String,
}
