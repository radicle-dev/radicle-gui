use radicle_localtime::LocalTime;

#[derive(Debug, PartialEq, Eq, Clone, serde::Serialize, serde::Deserialize, ts_rs::TS)]
#[serde(tag = "status")]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub enum SyncStatus {
    /// We're in sync.
    #[serde(rename_all = "camelCase")]
    Synced {
        /// At what ref was the remote synced at.
        at: SyncedAt,
    },
    /// We're out of sync.
    #[serde(rename_all = "camelCase")]
    OutOfSync {
        /// Local head of our `rad/sigrefs`.
        local: SyncedAt,
        /// Remote head of our `rad/sigrefs`.
        remote: SyncedAt,
    },
}

impl From<radicle::node::SyncStatus> for SyncStatus {
    fn from(value: radicle::node::SyncStatus) -> Self {
        match value {
            radicle::node::SyncStatus::Synced { at } => SyncStatus::Synced { at: at.into() },
            radicle::node::SyncStatus::OutOfSync { local, remote } => SyncStatus::OutOfSync {
                local: local.into(),
                remote: remote.into(),
            },
        }
    }
}

/// Holds an oid and timestamp.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[ts(export_to = "repo/")]
pub struct SyncedAt {
    #[ts(as = "String")]
    pub oid: radicle::git::Oid,
    #[ts(type = "number")]
    pub timestamp: LocalTime,
}

impl From<radicle::node::SyncedAt> for SyncedAt {
    fn from(value: radicle::node::SyncedAt) -> Self {
        Self {
            oid: value.oid,
            timestamp: value.timestamp,
        }
    }
}
